var gulp = require('gulp'),
	uglify = require('gulp-uglify'),
    jshint = require('gulp-jshint'),
    stylish = require('jshint-stylish'),
    rename = require('gulp-rename'),
    replace = require('gulp-replace'),
    ignore = require('gulp-ignore'),
    sourcemaps = require('gulp-sourcemaps'),
	request = require('request'),
	merge = require('merge-stream'),
    fs = require('fs'),
	del = require('del'),
    bump = require('gulp-bump'),
    tap = require('gulp-tap'),
    runSequence = require('run-sequence'),
    git = require('gulp-git'),
    glob = require('glob'),
    path = require('path'),
    shell = require('shelljs');
var args = require('yargs').argv;

var settings = {
    baseProject: 'jquery.dirtyforms',
    src: ['./jquery.dirtyforms.js', './helpers/*.js', './dialogs/*.js'],
    src_assets: ['./README.md', './pkg/*.json'],
    src_module_assets: ['./@(helpers|dialogs)/**/*.json', './@(helpers|dialogs)/**/README.md', './@(helpers|dialogs)/**/LICENSE*'],
    src_json_files: ['./**/*.json', '!./node_modules/**', '!./dist/**'],
    src_readme_files: ['./**/README*', '!./dist/**'],
    dest: './dist/',
    dest_plugins: '/plugins',
    nugetPath: './nuget.exe',
    subModules: [], // All of the git submodule names (individual releases) for the build
    version: '',
    debug: true
};

settings.subModules = getSubmoduleNames();
settings.version = getBuildVersion();
settings.debug = getDebug();

console.log('subModules: ' + settings.subModules);
console.log('Debug mode: ' + settings.debug);


// Builds the distribution files and packs them with NuGet
gulp.task('default', function (cb) {
    runSequence(
        'git-checkout',
        'pack',
        cb);
});

// Cleans the distribution folders
gulp.task('clean', function (cb) {
    del([settings.dest + '**/*.js',
        settings.dest + '**/*.map',
        settings.dest + '**/*.nupkg',
        settings.dest + '**/*.tgz',
        settings.dest + '**/*.css',
        settings.dest + '**/*.png',
        settings.dest + '**/*.gif',
        settings.dest + '**/README.*',
        settings.dest + '**/LICENSE.*',
        settings.dest + '**/*.json'], cb);
});

// Moves the .js files to the distribution folders and creates a minified version and sourcemap
gulp.task('build', ['copy-minified'], function (cb) {
    del([settings.dest + '*.js', settings.dest + '*.map'], cb);
});

// Tests the source files (smoke test)
gulp.task('test', function () {
    return gulp.src(settings.src, { base: './' })
        .pipe(jshint())
        .pipe(jshint.reporter(stylish));
});

gulp.task('copy-minified', ['uglify', 'distribute-module-assets'], function () {
    return gulp.src([settings.dest + '*.js', settings.dest + '*.map'], { base: './' })
        .pipe(rename(function (path) {
            console.log('moving: ' + path.basename)
            path.dirname = path.basename.replace(/\.min(?:\.js)?/g, '');
        }))
        .pipe(gulp.dest(settings.dest))
        .pipe(ignore.exclude(eval('/' + settings.baseProject + '\.min/')))
        // Make a copy of the minified files in the /dist/plugins directory for 
        // CDN distribution.
        .pipe(rename(function (path) {
            console.log('moving: ' + path.basename)
            path.dirname = settings.baseProject + settings.dest_plugins;
        }))
        .pipe(gulp.dest(settings.dest));
});

gulp.task('uglify', ['clean', 'test'], function () {
    return gulp.src(settings.src, { base: './' })
        .pipe(rename(function (path) {
            var baseName = path.basename;
            var dirName = path.dirname;
            if (dirName == 'helpers' || dirName == 'dialogs') {
                path.basename = settings.baseProject + '.' + dirName + '.' + baseName;
            }
            path.dirname = path.basename;
        }))
        .pipe(gulp.dest(settings.dest))
        // Remove log statements from minified code
        .pipe(replace(eval('/\\/\\*\\s*?<log>\\s*?\\*\\/[\\s\\S]*?\\/\\*\\s*?<\\/log>\\s*?\\*\\//g'), ''))
        .pipe(replace(eval('/(?:\\$\\.DirtyForms\\.)?dirtylog\\([\\s\\S]*?\\);/g'), ''))
        .pipe(sourcemaps.init())
        .pipe(rename(function (path) {
            path.dirname = '';
            path.extname = '.min.js';
        }))
        .pipe(uglify({
            outSourceMap: true,
            sourceRoot: '/'
        }))
        .pipe(gulp.dest(settings.dest))
        .pipe(sourcemaps.write('.', {
            includeContent: true,
            sourceRoot: '/'
        }))
        .pipe(gulp.dest(settings.dest));
});

gulp.task('distribute-default-license', ['clean'], function () {
    var defaultLicense = './LICENSE*';
    var baseModule = gulp.src(defaultLicense, { base: './' })
        .pipe(rename(function (path) {
            path.dirname = settings.baseProject;
        }))
        .pipe(gulp.dest(settings.dest));

    var merged = merge(baseModule);
    var modulesLength = settings.subModules.length;
    for (var i = 0; i < modulesLength; i++) {
        var subModule = settings.subModules[i];
        var module = gulp.src(defaultLicense, { base: './' })
            .pipe(ignore(settings.baseProject))
            .pipe(gulp.dest(settings.dest + subModule));

        merged.add(module);
    }

    return merged;
});

gulp.task('distribute-assets', ['distribute-default-license'], function () {
    return gulp.src(settings.src_assets, { base: './' })
        .pipe(rename(function (path) {
            path.dirname = settings.baseProject;
        }))
        .pipe(gulp.dest(settings.dest));
});

gulp.task('distribute-module-assets', ['distribute-assets'], function () {
    return gulp.src(settings.src_module_assets, { base: './' })
        .pipe(rename(function (path) {
            var segments = path.dirname.split(/[/\\]/);
            var rootDir = segments[0];
            if (rootDir == 'helpers' || rootDir == 'dialogs') {
                console.log('moving: ' + path.dirname + '/' + path.basename + '.' + path.extname);
                var pkgDir = segments[1].replace('.pkg', '');
                path.dirname = settings.baseProject + '.' + rootDir + '.' + pkgDir;
            }
        }))
        .pipe(gulp.dest(settings.dest));
});

// Runs the build, downloads the NuGet.exe file, and packs the distribution files with NuGet
gulp.task('nuget-pack', ['nuget-download', 'build'], function (cb) {
    console.log('build version: ' + settings.version);

    // Get the nuspec files
    var nuspecFiles = glob.sync("./**/*.nuspec");

    console.log('Nuspec files: ' + nuspecFiles);

    var nuspecLength = nuspecFiles.length;
    for (var i = 0; i < nuspecLength; i++) {
        var nuspecFile = nuspecFiles[i];
        var absoluteNuspecFile = path.resolve(nuspecFile);
        var absoluteNugetPath = path.resolve(settings.nugetPath);
        var absoluteDistributionFolder = path.resolve(settings.dest);

        // Pack NuGet file
        if (shell.exec('"' + absoluteNugetPath + '" pack "' + absoluteNuspecFile + '" -Version ' + settings.version + ' -OutputDirectory "' + absoluteDistributionFolder + '"').code != 0) {
            shell.echo('Error: NuGet pack failed for ' + absoluteNuspecFile);
            shell.exit(1);
        }
    }

    cb();
});

gulp.task('nuget-download', function () {
    if (fs.existsSync(settings.nugetPath)) {
        done();
        return;
    }

    return request.get('http://nuget.org/nuget.exe')
        .pipe(fs.createWriteStream(settings.nugetPath))
        .on('close', done);
});

gulp.task('npm-pack', ['build'], function (cb) {
    var modulesLength = settings.subModules.length;
    var relativeDestPath = path.relative('./', settings.dest);
    for (var i = 0; i < modulesLength; i++) {
        var subModule = settings.subModules[i];
        var cwd = settings.dest + subModule;
        var relativeWorkingPath = path.relative('./', cwd);

        console.log('Packing ' + relativeWorkingPath + ' for NPM...');
        if (shell.exec('cd "' + relativeDestPath + '" && npm pack "' + subModule + '"').code != 0) {
            shell.echo('Error: NPM pack for ' + relativeWorkingPath + ' failed');
            shell.exit(1);
        }
    }
    cb();
});

gulp.task('pack', ['nuget-pack', 'npm-pack'], function (cb) {
    cb();
});


gulp.task('bump-version', function () {
    var argsVersion = args.version;
    var buildType = args.buildType;
    var preid = args.preid;

    console.log('build type: ' + buildType);

    if (typeof (argsVersion) == 'undefined') {
        return gulp.src(settings.src_json_files, { base: './' })
            .pipe(bump({ type: buildType }))
            .pipe(tap(function (file, t) {
                var newPkg = JSON.parse(file.contents.toString());
                settings.version = newPkg.version;
            }))
            .pipe(gulp.dest('./'));
    }
    else {
        return gulp.src(settings.src_json_files, { base: './' })
            .pipe(bump({ version: settings.version, preid: preid }))
            .pipe(gulp.dest('./'));
    }
});

gulp.task('bump-readme-version', ['bump-version'], function () {
    return gulp.src(settings.src_readme_files, { base: './' })
        // Replace the version number in the CDN URLs
        .pipe(replace(eval('/\\/' + settings.baseProject + '\\/\\d+\\.\\d+\\.\\d+(?:-\\w+)?\\//g'), '/' + settings.baseProject + '/' + settings.version + '/'))
        .pipe(replace(eval('/' + settings.baseProject + '\\@\\d+\\.\\d+\\.\\d+(?:-\\w+)?/g'), settings.baseProject + '@' + settings.version))
        .pipe(gulp.dest('.'));
});

// Bumps the version number.
// CLI args:
//   --version=1.0.0     // sets the build to a specific version number
//   --buildType=minor   // if the version is not specified, increments the minor version and resets the patch version to 0
//                       // allowed values: major, minor, patch
gulp.task('bump', ['bump-readme-version'], function (cb) {
    console.log('Successfully bumped version to: ' + settings.version);
    cb();
});

// Writes the current version of Git to the console
gulp.task('git-version', function (cb) {
    if (shell.exec('git --version').code != 0) {
        shell.echo('Error: Git --version failed');
        shell.exit(1);
    }
    else {
        cb();
    }
});

gulp.task('git-submodule-update-init', function (cb) {
    git.updateSubmodule({ args: '--init --recursive', cwd: './' }, cb);
});

gulp.task('git-submodule-checkout', ['git-submodule-update-init'], function (cb) {
    var modulesLength = settings.subModules.length;
    for (var i = 0; i < modulesLength; i++) {
        var subModule = settings.subModules[i];
        var cwd = settings.dest + subModule;
        var relativeWorkingPath = path.relative('./', cwd);

        console.log('Checking Out Git submodule ' + relativeWorkingPath + '...');
        if (shell.exec('cd "' + relativeWorkingPath + '" && git checkout master').code != 0) {
            shell.echo('Error: Git checkout failed for ' + relativeWorkingPath);
            shell.exit(1);
        }
    }

    cb();
});

gulp.task('git-checkout', ['git-submodule-checkout'], function (cb) {
    if (settings.debug == false) {
        git.checkout('master', { cwd: './' }, cb);
    } else {
        cb();
    }
});

gulp.task('git-release-modules', function (cb) {
    var modulesLength = settings.subModules.length;
    for (var i = 0; i < modulesLength; i++) {
        var subModule = settings.subModules[i];
        var cwd = settings.dest + subModule;
        var relativeWorkingPath = path.relative('./', cwd);

        console.log('Adding files to Git submodule ' + relativeWorkingPath + '...');
        if (shell.exec('cd "' + relativeWorkingPath + '" && git add -A').code != 0) {
            shell.echo('Error: Git add failed for ' + relativeWorkingPath);
            shell.exit(1);
        }
        else {
            console.log('Committing files to Git submodule ' + relativeWorkingPath + '...');
            if (shell.exec('cd "' + relativeWorkingPath + '" && git commit -m "Release version ' + settings.version + '"').code != 0) {
                shell.echo('Error: Git commit failed for ' + relativeWorkingPath);
                shell.exit(1);
            }
            else {
                console.log('Tagging Git submodule ' + relativeWorkingPath + '...');
                if (shell.exec('cd "' + relativeWorkingPath + '" && git tag ' + settings.version + ' -m "Release version ' + settings.version + '"').code != 0) {
                    shell.echo('Error: Git tag failed for ' + relativeWorkingPath);
                    shell.exit(1);
                }
                else {
                    console.log('Pushing Git submodule ' + relativeWorkingPath + '...');
                    if (shell.exec('cd "' + relativeWorkingPath + '" && git push origin master --follow-tags' + ((settings.debug) ? ' --dry-run' : '')).code != 0) {
                        shell.echo('Error: Git push failed for ' + relativeWorkingPath);
                        shell.exit(1);
                    }
                }
            }
        }
    }

    cb();
});

gulp.task('git-add', function (cb) {
    git.exec({ args: 'add -A', cwd: './' }, cb);
});

gulp.task('git-commit', ['git-add'], function (cb) {
    if (shell.exec('git commit -m "Release version ' + settings.version + '"').code != 0) {
        shell.echo('Error: Git commit failed for ' + settings.baseProject);
        shell.exit(1);
    }
    else {
        cb();
    }
});

gulp.task('git-tag', ['git-commit'], function (cb) {
    git.tag(settings.version, 'Release version ' + settings.version, { cwd: './' }, cb);
});

gulp.task('git-submodule-update', ['git-tag'], function (cb) {
    git.updateSubmodule({ cwd: './' }, cb);
});

gulp.task('git-push', ['git-submodule-update'], function (cb) {
    git.push('origin', 'master', { args: '--follow-tags' + ((settings.debug) ? ' --dry-run' : ''), cwd: './' }, cb, function (err) {
        if (err) throw err;
    });
});

// Performs a release
//   1. Ensures the repository and submodules are up to date
//   2. Bumps the version (can specify version on the CLI, for example: --version=1.0.0-alpha00003, --version=1.2.3)
//   3. Builds the distribution files
//   4. Packages the distribution files with NuGet
//   5. Commits the distribution files
//   6. Tags the repository and all submodules with the release version
//   7. Pushes the repository and all submodules to their origin remote, including tags
gulp.task('release', function (cb) {
    runSequence(
        'git-checkout',
        'bump',
        'pack',
        'git-release-modules',
        'git-push',
        cb);
});

function done() { }

function getSubmoduleNames() {
    var subModules = [];
    var baseSubmodule = settings.baseProject;
    subModules.push(baseSubmodule);

    // Load helper and dialog names
    // http://stackoverflow.com/questions/30623886/get-an-array-of-file-names-without-extensions-from-a-directory-in-gulp/30680952#30680952
    glob.sync("@(helpers|dialogs)/*.js")
        .forEach(function (file) {
            var dirName = path.dirname(file);
            var baseName = path.basename(file, path.extname(file));
            var subModule = baseSubmodule + '.' + dirName + '.' + baseName;
            subModules.push(subModule);
        });

    return subModules;
};

function getBuildVersion() {
    var packageVersion = getPackageJsonVersion();
    var argsVersion = args.version;

    console.log('config version: ' + packageVersion);
    console.log('args version: ' + argsVersion);

    // Override the version number with the CLI argument --version=1.2.3
    if (typeof (argsVersion) !== 'undefined') {
        return argsVersion;
    }

    return packageVersion;
};

function getPackageJsonVersion() {
    //We parse the json file instead of using require because require caches multiple calls so the version number won't be updated
    return JSON.parse(fs.readFileSync('./package.json', 'utf8')).version;
};

function getDebug() {
    var argsDebug = args.debug;

    // Override the debug setting with the CLI argument --debug=false
    if (typeof (argsDebug) !== 'undefined') {
        return argsDebug.toLowerCase() === 'true';
    }

    return settings.debug;
};
