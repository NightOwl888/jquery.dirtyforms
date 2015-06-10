var gulp = require('gulp'),
    nuget = require('gulp-nuget'),
	uglify = require('gulp-uglify'),
	out = require('gulp-out'),
    jshint = require('gulp-jshint'),
    stylish = require('jshint-stylish'),
    rename = require('gulp-rename'),
    sourcemaps = require('gulp-sourcemaps'),
	request = require('request'),
    fs = require('fs'),
	del = require('del'),
    bump = require('gulp-bump'),
    tap = require('gulp-tap'),
    runSequence = require('run-sequence'),
    run = require('gulp-run'),
    git = require('gulp-git'),
    glob = require('glob'),
    path = require('path'),
    Q = require('q'),
    shell = require('shelljs');
var args = require('yargs').argv;
// All of the git submodule names (individual releases) for the build
var subModules = getSubmoduleNames();
var distributionFolder = './dist/';
var nugetPath = './nuget.exe';
var version = getBuildVersion();
var currentTask;

console.log('subModules: ' + subModules);

gulp.Gulp.prototype.__runTask = gulp.Gulp.prototype._runTask;
gulp.Gulp.prototype._runTask = function (task) {
    currentTask = task;
    this.__runTask(task);
}


// Builds the distribution files and packs them with NuGet
gulp.task('default', ['nuget'], function () {

});

// Cleans the distribution folders
gulp.task('clean', function (cb) {
    del([distributionFolder + '**/*.js', distributionFolder + '**/*.map', distributionFolder + '**/*.nupkg'], cb);
});

// Moves the .js files to the distribution folders and creates a minified version
gulp.task('build', ['clean'], function () {
    return gulp.src(['./jquery.dirtyforms.js', './helpers/*.js', './dialogs/*.js'], { base: './' })
        .pipe(jshint())
        .pipe(jshint.reporter(stylish))
        .pipe(rename(function (path) {
            var baseName = path.basename;
            var dirName = path.dirname;
            if (dirName == 'helpers' || dirName == 'dialogs') {
                path.basename = 'jquery.dirtyforms.' + dirName + '.' + baseName;
                console.log(path.basename);
            }
            path.dirname = path.basename;
        }))
        .pipe(gulp.dest(distributionFolder))
        //.pipe(sourcemaps.init())
        .pipe(rename(function (path) {
            var baseName = path.basename;
            var dirName = path.dirname;
            if (dirName == 'helpers' || dirName == 'dialogs') {
                path.basename = 'jquery.dirtyforms.' + dirName + '.' + baseName;
                console.log(path.basename);
            }
            path.dirname = path.basename;
            path.extname = '.min.js';
        }))
        .pipe(uglify({
            output: {
                //comments: true
            },
            outSourceMap: true,
            sourceRoot: '/'
        }))
        //.pipe(gulp.dest(distributionFolder))
        //.pipe(sourcemaps.write('.', {
        //    includeContent: true,
        //    sourceRoot: '/'
        //}))
        .pipe(gulp.dest(distributionFolder));
});

// Runs the build, downloads the NuGet.exe file, and packs the distribution files with NuGet
gulp.task('nuget', ['nuget-pack'], function(cb) {
    // Clean up extra files in the main directory
    del('./*.nupkg', cb);
});

gulp.task('nuget-pack', ['nuget-download', 'build'], function () {
    console.log('build version: ' + version);
    //console.log('nuget api key: ' + args.nugetApiKey);

    var deferred = Q.defer();

    // Get the nuspec files
    var nuspecFiles = glob.sync("./**/*.nuspec");

    console.log('Nuspec files: ' + nuspecFiles);

    var nuspecLength = nuspecFiles.length;
    for (var i = 0; i < nuspecLength; i++) {
        var nuspecFile = nuspecFiles[i];
        
        // Pack NuGet file
        gulp.src('', { base: './' })
            .pipe(nuget.pack({ nuspec: nuspecFile, nuget: nugetPath, version: version }))
            .pipe(rename(function (path) {
                var baseName = path.basename;
                var dirName = path.dirname;
                if (dirName == 'helpers' || dirName == 'dialogs') {
                    path.basename = 'jquery.dirtyforms.' + dirName + '.' + baseName;
                }
                path.dirname = path.basename;
            }))
            .pipe(out(distributionFolder + '{basename}.nupkg'));
    }

    // This is here to force the command to wait before returning...
    // Couldn't find a better way to run multiple commands in a loop and wait for them to complete.
    setTimeout(function () {
        deferred.resolve();
    }, 2000);

    return deferred.promise;
});

gulp.task('nuget-download', function () {
    if (fs.existsSync(nugetPath)) {
        done();
        return;
    }

    return request.get('http://nuget.org/nuget.exe')
        .pipe(fs.createWriteStream(nugetPath))
        .on('close', done);
});

gulp.task('bump-version', function () {
    var argsVersion = args.version;
    var buildType = args.buildType;
    var preid = args.preid;

    console.log('build type: ' + buildType);

    if (typeof (argsVersion) == 'undefined') {
        return gulp.src(['./package.json', './dist/jquery.dirtyforms/bower.json'], { base: './' })
            .pipe(bump({ type: buildType }))
            .pipe(tap(function (file, t) {
                var newPkg = JSON.parse(file.contents.toString());
                version = newPkg.version;
            }))
            .pipe(gulp.dest('./'));
    }
    else {
        return gulp.src(['./package.json', './dist/jquery.dirtyforms/bower.json'], { base: './' })
            .pipe(bump({ version: version, preid: preid }))
            .pipe(gulp.dest('./'));
    }
});

// Bumps the version number.
// CLI args:
//   --version=1.0.0     // sets the build to a specific version number
//   --buildType=minor   // if the version is not specified, increments the minor version and resets the patch version to 0
//                       // allowed values: major, minor, patch
gulp.task('bump', ['bump-version'], function (cb) {
    console.log('Successfully bumped version to: ' + version);
    cb();
});

// Writes the current version of Git to the console
gulp.task('git-version', function (cb) {
    run('git --version').exec(cb)   
});

gulp.task('git-submodule-update-init', function (cb) {
    //git.updateSubmodule({ args: '--init', cwd: './' }, cb);

    if (shell.exec('git submodule init').code != 0) {
        shell.echo('Error: Git submodule init failed');
        shell.exit(1);
    }
    else {
        if (shell.exec('git submodule update').code != 0) {
            shell.echo('Error: Git submodule update failed');
            shell.exit(1);
        }
        else {
            cb();
        }
    }
});

gulp.task('git-submodule-checkout', ['git-submodule-update-init'], function (cb) {
    var modulesLength = subModules.length;
    for (var i = 0; i < modulesLength; i++) {
        var subModule = subModules[i];
        var cwd = distributionFolder + subModule;

        if (shell.exec('cd ' + cwd + ' && git checkout master').code != 0) {
            shell.echo('Error: Git checkout failed for ' + cwd);
            shell.exit(1);
        }
        else {
            cb();
        }
    }


    //var command = function (cwd, callback) {
    //    git.checkout('master', { cwd: cwd }, callback);
    //};

    //orchestrateSubmodules(currentTask.name, command, cb);
});

gulp.task('git-checkout', ['git-submodule-checkout'], function (cb) {
    git.checkout('master', { cwd: './' }, cb);
});

gulp.task('git-release-modules', function (cb) {
    var modulesLength = subModules.length;
    for (var i = 0; i < modulesLength; i++) {
        var subModule = subModules[i];
        var cwd = distributionFolder + subModule;

        if (shell.exec('cd ' + cwd + ' && git add -A').code != 0) {
            shell.echo('Error: Git add failed for ' + cwd);
            shell.exit(1);
        }
        else {
            if (shell.exec('cd ' + cwd + ' && git commit -m "Release version ' + version + '"').code != 0) {
                shell.echo('Error: Git commit failed for ' + cwd);
                shell.exit(1);
            }
            else {
                if (shell.exec('cd ' + cwd + ' && git tag ' + version + ' -m "Release version ' + version + '"').code != 0) {
                    shell.echo('Error: Git tag failed for ' + cwd);
                    shell.exit(1);
                }
                else {
                    if (shell.exec('cd ' + cwd + ' && git push origin master').code != 0) {
                        shell.echo('Error: Git push failed for ' + cwd);
                        shell.exit(1);
                    }
                    else {
                        cb();
                    }
                }
            }
        }
    }
});

gulp.task('git-add', ['git-submodule-add'], function (cb) {
    git.exec({ args: 'add -A', cwd: './' }, cb);
});

gulp.task('git-commit', ['git-add'], function () {
    return gulp.src('./*.json')
        .pipe(git.commit('Release version ' + version, { cwd: './' }));
});

gulp.task('git-tag', ['git-commit'], function (cb) {
    git.tag(version, 'Release version ' + version, { cwd: './' }, cb);
});

gulp.task('git-submodule-update', ['git-tag'], function (cb) {
    git.updateSubmodule({ cwd: './' }, cb);
});

gulp.task('git-push', ['git-submodule-update'], function (cb) {
    git.push('origin', 'master', { args: '--follow-tags', cwd: './' }, cb, function (err) {
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
gulp.task('release', function (callback) {
    runSequence('git-checkout',
        'bump',
        'nuget',
        'git-release-modules',
        'git-push',
        callback);
});

function done() { }

function getSubmoduleNames() {
    var subModules = [];
    var baseSubmodule = 'jquery.dirtyforms';
    subModules.push(baseSubmodule);

    //// Load helper and dialog names
    //// http://stackoverflow.com/questions/30623886/get-an-array-of-file-names-without-extensions-from-a-directory-in-gulp/30680952#30680952
    //glob.sync("@(helpers|dialogs)/*.js")
    //    .forEach(function (file) {
    //        //console.log('file: ' + file);
    //        //console.log('file: ' + path.basename(file));

    //        var dirName = path.dirname(file);
    //        var baseName = path.basename(file, path.extname(file));
    //        var subModule = baseSubmodule + '.' + dirName + '.' + baseName;
    //        subModules.push(subModule);
    //    });

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










//function orchestrateSubmodules(taskRootName, command, cb) {
//    console.log('taskRootName: ' + taskRootName);
//    var orchestrator = new Orchestrator();
//    var taskNames = [];

//    var modulesLength = subModules.length;
//    for (var i = 0; i < modulesLength; i++) {
//        var subModule = subModules[i];
//        var taskName = taskRootName + subModule;
//        var cwd = distributionFolder + subModule;

//        orchestrator.add(taskName, function (callback) {
//            var _cwd = cwd;
//            var _command = command;
//            _command(cwd, callback);
//        });

//        // Add the task name 
//        taskNames.push(taskName);
//    }

//    orchestrator.start(taskNames, cb);
//};

//gulp.task('git-submodule-checkout', ['git-submodule-update-init'], function (cb) {
//    var command = function (cwd, callback) {
//        git.checkout('master', { cwd: cwd }, callback);
//    };

//    orchestrateSubmodules(currentTask.name, command, cb);
//});

//gulp.task('git-submodule-add', function (cb) {
//    var command = function (cwd, callback) {
//        git.exec({ args: 'add -A', cwd: cwd }, callback);
//    };

//    orchestrateSubmodules(currentTask.name, command, cb);
//});

//gulp.task('git-submodule-commit', ['git-add'], function (cb) {
//    var command = function (cwd, callback) {
//        //return gulp.src(['./*.js', './*.json'])
//        //    .pipe(git.commit('Release version ' + version, { cwd: cwd }));
//        if (shell.exec('cd ' + cwd + ' && git commit -m "Release version ' + version + '"').code != 0) {
//            shell.echo('Error: Git commit failed');
//            shell.exit(1);
//        }
//        else {
//            callback();
//        }
//    };

//    //var deferred = Q.defer();

//    orchestrateSubmodules(currentTask.name, command, cb);

//    //// Commit submodules
//    //runCommandOnSubmodules(command);

//    //// This is here to force the command to wait before returning...
//    //// Couldn't find a better way to run multiple commands in a loop and wait for them to complete.
//    //setTimeout(function () {
//    //    deferred.resolve();
//    //}, 10000);

//    //return deferred.promise;
//});





//gulp.task('git-submodule-commit', ['git-add'], function (cb) {
//    var command = function (cwd, callback) {
//        git.exec({ args: 'commit --message=\'Release version ' + version + '\'', cwd: cwd }, callback);
//    };

//    orchestrateSubmodules(currentTask.name, command, cb);
//});

//gulp.task('git-commit', ['git-submodule-commit'], function (cb) {
//    git.exec({ args: 'commit --message=\'Release version ' + version + '\'', cwd: cwd }, cb);
//});

//gulp.task('git-submodule-tag', ['git-commit'], function (cb) {
//    var command = function (cwd, callback) {
//        git.tag(version, 'Release version ' + version, { cwd: cwd }, callback);
//    };

//    orchestrateSubmodules(currentTask.name, command, cb);
//});

//gulp.task('git-submodule-push', ['git-submodule-update'], function (cb) {
//    var command = function (cwd, callback) {
//        git.push('origin', 'master', { args: '--follow-tags', cwd: cwd }, callback, function (err) {
//            if (err) throw err;
//        });
//    };

//    orchestrateSubmodules(currentTask.name, command, cb);
//});


//function runCommandOnSubmodules(command) {
//    var modulesLength = subModules.length;
//    for (var i = 0; i < modulesLength; i++) {
//        var subModule = subModules[i];
//        // Pass in the working directory for the git command.
//        command(distributionFolder + subModule);
//    }
//};

//gulp.task('git-push'/*, ['git-tag'] */, function () {
//    var command = 'git push';

//    // Tag submodules
//    runCommandOnSubmodules(command);

//    // Tag main repo
//    run(command).exec();
//});


//gulp.task('order', function (callback) {
//    runSequence('task1',
//        'task2',
//        'task3',
//        'task4',
//        'task5',
//        'task6',
//        callback);
//});

//gulp.task('task1', function () {
//    console.info('task1');
//});

//gulp.task('task2', function () {
//    console.info('task2');
//});

//gulp.task('task3', function () {
//    console.info('task3');
//});

//gulp.task('task4', function () {
//    console.info('task4');
//});

//gulp.task('task5', function () {
//    console.info('task5');
//});

//gulp.task('task6', function () {
//    console.info('task6');
//});


//function clean() {
//    rimraf(distributionFolder + '*.js');
//}

//function build() {
//    // Compress js
//    //gulp.src(['./jquery.dirtyforms.js'], { base: './' })
//    //    .pipe(uglify())
//    //    .pipe(out('./dist/{basename}.min{extension}'));
//    //gulp.src(['./dist/jquery.dirtyforms/jquery.dirtyforms.js'])
//    //    .pipe(uglify())
//    //    .pipe(out('{basename}.min{extension}'));

//    //gulp.src(['./jquery.dirtyforms.js'])
//    //    .pipe(uglify())
//    //    .pipe(out('./dist/jquery.dirtyforms/{basename}.min{extension}'));

//    // v1.0.0
//    //gulp.src(['./jquery.dirtyforms.js'], { base: './' })
//    //    .pipe(jshint())
//    //    .pipe(jshint.reporter(stylish))
//    //    .pipe(out(distributionFolder + 'jquery.dirtyforms.js'))
//    //    .pipe(uglify())
//    //    .pipe(out(distributionFolder + '{basename}.min{extension}'));

//    // TODO: Update distribution folder (s)

//    return gulp.src(['./jquery.dirtyforms.js', './helpers/**/!(alwaysdirty).js'], { base: './' })
//        .pipe(jshint())
//        .pipe(jshint.reporter(stylish))
//        .pipe(concat('jquery.dirtyforms.js', { newLine: '\n' }))
//        .pipe(gulp.dest(distributionFolder))
//        //.pipe(sourcemaps.init())
//        .pipe(rename('jquery.dirtyforms.min.js'))
//        .pipe(uglify())
//        //.pipe(gulp.dest(distributionFolder))
//        ////.pipe(rename('jquery.dirtyforms.min'))
//        //.pipe(sourcemaps.write('../jquery.dirtyforms'))
//        ////.pipe(sourcemaps.write('./jquery.dirtyforms.min.map'))
//        .pipe(gulp.dest(distributionFolder));
//};

//function build() {
//    // Compress js
//    //gulp.src(['./jquery.dirtyforms.js'], { base: './' })
//    //    .pipe(uglify())
//    //    .pipe(out('./dist/{basename}.min{extension}'));
//    //gulp.src(['./dist/jquery.dirtyforms/jquery.dirtyforms.js'])
//    //    .pipe(uglify())
//    //    .pipe(out('{basename}.min{extension}'));

//    //gulp.src(['./jquery.dirtyforms.js'])
//    //    .pipe(uglify())
//    //    .pipe(out('./dist/jquery.dirtyforms/{basename}.min{extension}'));

//    // v1.0.0
//    //gulp.src(['./jquery.dirtyforms.js'], { base: './' })
//    //    .pipe(jshint())
//    //    .pipe(jshint.reporter(stylish))
//    //    .pipe(out(distributionFolder + 'jquery.dirtyforms.js'))
//    //    .pipe(uglify())
//    //    .pipe(out(distributionFolder + '{basename}.min{extension}'));

//    // TODO: Update distribution folder (s)

//    //return gulp.src(['./jquery.dirtyforms.js', './helpers/**/!(alwaysdirty).js'], { base: './' })
//    //    .pipe(jshint())
//    //    .pipe(jshint.reporter(stylish))
//    //    .pipe(concat('jquery.dirtyforms.js', { newLine: '\n' }))
//    //    .pipe(gulp.dest(distributionFolder))
//    //    //.pipe(sourcemaps.init())
//    //    .pipe(rename('jquery.dirtyforms.min.js'))
//    //    .pipe(uglify())
//    //    //.pipe(gulp.dest(distributionFolder))
//    //    ////.pipe(rename('jquery.dirtyforms.min'))
//    //    //.pipe(sourcemaps.write('../jquery.dirtyforms'))
//    //    ////.pipe(sourcemaps.write('./jquery.dirtyforms.min.map'))
//    //    .pipe(gulp.dest(distributionFolder));

//    //return gulp.src(['./jquery.dirtyforms.js', './helpers/*.js', './dialogs/*.js'], { base: './' })
//    //    .pipe(jshint())
//    //    .pipe(jshint.reporter(stylish))
//    //    .pipe(rename(function (path) {
//    //        path.dirname = path.basename;
//    //    }))
//    //    .pipe(gulp.dest(distributionFolder))
//    //    //.pipe(sourcemaps.init())
//    //    .pipe(rename(function (path) {
//    //        path.dirname = path.basename;
//    //        path.extname = '.min.js';
//    //    }))
//    //    .pipe(uglify({
//    //        output: {
//    //            comments: true
//    //        },
//    //        outSourceMap: true,
//    //        sourceRoot: '/'
//    //    }))
//    //    //.pipe(gulp.dest(distributionFolder))
//    //    //.pipe(sourcemaps.write('.', {
//    //    //    includeContent: true,
//    //    //    sourceRoot: '/'
//    //    //}))
//    //    .pipe(gulp.dest(distributionFolder));

//        //.pipe(concat('jquery.dirtyforms.js', { newLine: '\n' }))
//        //.pipe(gulp.dest(distributionFolder))
//        ////.pipe(sourcemaps.init())
//        //.pipe(rename('jquery.dirtyforms.min.js'))
//        //.pipe(uglify())
//        ////.pipe(gulp.dest(distributionFolder))
//        //////.pipe(rename('jquery.dirtyforms.min'))
//        ////.pipe(sourcemaps.write('../jquery.dirtyforms'))
//        //////.pipe(sourcemaps.write('./jquery.dirtyforms.min.map'))
//        //.pipe(gulp.dest(distributionFolder));
//};

//gulp.task('uglify', ['clean'], function() {
//	// Compress js
//    //gulp.src(['./jquery.dirtyforms.js'], { base: './' })
//    //    .pipe(uglify())
//    //    .pipe(out('./dist/{basename}.min{extension}'));
//    //gulp.src(['./dist/jquery.dirtyforms/jquery.dirtyforms.js'])
//    //    .pipe(uglify())
//    //    .pipe(out('{basename}.min{extension}'));

//    //gulp.src(['./jquery.dirtyforms.js'])
//    //    .pipe(uglify())
//    //    .pipe(out('./dist/jquery.dirtyforms/{basename}.min{extension}'));

//    // v1.0.0
//    //gulp.src(['./jquery.dirtyforms.js'], { base: './' })
//    //    .pipe(jshint())
//    //    .pipe(jshint.reporter(stylish))
//    //    .pipe(out(distributionFolder + 'jquery.dirtyforms.js'))
//    //    .pipe(uglify())
//    //    .pipe(out(distributionFolder + '{basename}.min{extension}'));

//    // TODO: Update distribution folder (s)

//    return gulp.src(['./jquery.dirtyforms.js', './helpers/**/!(alwaysdirty).js'], { base: './' })
//        .pipe(jshint())
//        .pipe(jshint.reporter(stylish))
//        .pipe(concat('jquery.dirtyforms.js', { newLine: '\n' }))
//        .pipe(gulp.dest(distributionFolder))
//        //.pipe(sourcemaps.init())
//        .pipe(rename('jquery.dirtyforms.min.js'))
//        .pipe(uglify())
//        //.pipe(gulp.dest(distributionFolder))
//        ////.pipe(rename('jquery.dirtyforms.min'))
//        //.pipe(sourcemaps.write('../jquery.dirtyforms'))
//        ////.pipe(sourcemaps.write('./jquery.dirtyforms.min.map'))
//        .pipe(gulp.dest(distributionFolder));
//});

//gulp.task('git-tag', ['git-commit'], function () {
//    var command = 'git tag -a ' + version + ' -m "Release version ' + version + '"';

//    // Tag submodules
//    runCommandOnSubmodules(command);

//    // Tag main repo
//    run(command).exec();

//    run('git submodule update').exec();
//});

//gulp.task('git-tag'/*, ['git-commit'] */, function () {
//    var command = function (cwd) {
//        git.tag(version, 'Release version ' + version, { cwd: cwd });
//    };

//    //var command = 'tag -a ' + version + ' -m "Release version ' + version + '"';

//    // Tag submodules
//    //runCommandOnSubmodules(command);

//    // Tag main repo
//    //run(command).exec();

//    //run('git submodule update').exec();

//    //runCommandOnSubmodules(command);

//    gulp.src()
//        .pipe(runCommandOnSubmodules(command))
//        //.pipe(command())
//        //.pipe(git.updateSubmodule());

//    //git.status();
//});

//gulp.task('git-push-commits', ['git-update-submodule-final'], function () {
//    var command = function (cwd) {
//        git.push('origin', 'master', function (err) {
//            if (err) throw err;
//        });
//    };

//    // Push submodules
//    runCommandOnSubmodules(command);

//    // Push main repo
//    command();
//});

//gulp.task('git-push-tags', ['git-push-commits'], function () {
//    var command = function (cwd) {
//        git.push('origin', 'master', { args: '--tags' }, function (err) {
//            if (err) throw err;
//        });
//    };

//    // Push submodules
//    runCommandOnSubmodules(command);

//    // Push main repo
//    command();
//});

//gulp.task('git-push', ['git-push-tags'], function () {

//});


//function bumpVersion() {
//    var argsVersion = args.version;
//    var buildType = args.buildType;

//    console.log('build type: ' + buildType);

//    if (typeof (argsVersion) == 'undefined') {
//        return gulp.src(['./package.json', './dist/jquery.dirtyforms/bower.json'], { base: './' })
//            .pipe(bump({ type: buildType }))
//            .pipe(tap(function (file, t) {
//                var newPkg = JSON.parse(file.contents.toString());
//                version = newPkg.version;
//            }))
//            .pipe(gulp.dest('./'));
//    }
//    else {
//        return gulp.src(['./package.json', './dist/jquery.dirtyforms/bower.json'], { base: './' })
//            .pipe(bump({ version: version }))
//            .pipe(gulp.dest('./'));
//    }
//};


//function gitCheckout() {
//    var command = function (cwd) {
//        git.checkout('master');
//    };

//    // Switch to master branch in submodules (defaults to headless with no branch)
//    runCommandOnSubmodules(command);

//    // Switch to master branch in main repo (releases can only be done from this branch)
//    //command();
//};

//function gitCommit() {
//    var command = function (cwd) {
//        gulp.src(cwd + '*')
//            .pipe(git.commit('Release version ' + version));
//    };

//    // Commit submodules
//    runCommandOnSubmodules(command);

//    // Commit main repo
//    command('./');
//};

//function gitTag() {
//    var command = function (cwd) {
//        git.tag(version, 'Release version ' + version, { cwd: cwd });
//    };

//    // Tag submodules
//    runCommandOnSubmodules(command);

//    // Tag main repo
//    command();
//};

//function gitPushCommits() {
//    var command = function (cwd) {
//        git.push('origin', 'master', function (err) {
//            if (err) throw err;
//        });
//    };

//    // Push submodules
//    runCommandOnSubmodules(command);

//    // Push main repo
//    command();
//};

//function gitPushTags() {
//    var command = function (cwd) {
//        git.push('origin', 'master', { args: '--tags' }, function (err) {
//            if (err) throw err;
//        });
//    };

//    // Push submodules
//    runCommandOnSubmodules(command);

//    // Push main repo
//    command();
//};






////gulp.task('run-stuff', function () {
////    task1();
////    task2();
////    task3();
////});

////function task1() {
////    //var deferred = Q.defer();

////    console.log('task1 start');

////    //// do async stuff
////    //setTimeout(function () {
////    //    deferred.resolve();
////    //}, 3000);

////    console.log('task1 end');

////    //return deferred.promise;
////};

////function task2() {
////    //var deferred = Q.defer();

////    console.log('task2 start');

////    //// do async stuff
////    //setTimeout(function () {
////    //    deferred.resolve();
////    //}, 1);

////    console.log('task2 end');

////    //return deferred.promise;
////};

////function task3() {
////    //var deferred = Q.defer();

////    console.log('task3 start');

////    //// do async stuff
////    //setTimeout(function () {
////    //    deferred.resolve();
////    //}, 1000);

////    console.log('task3 end');

////    //return deferred.promise;
////};

//gulp.task('git-submodule-update', function () {
//    var deferred = Q.defer();

//    git.updateSubmodule({ args: '--init' });

//    //run('git submodule init').exec();
//    //run('git submodule update').exec();

//    //var command = 'git checkout master';

//    //// Switch to master branch in submodules (defaults to headless with no branch)
//    //runCommandOnSubmodules(command);

//    //// Switch to master branch in main repo (releases can only be done from this branch)
//    ////run(command).exec();

//    // This is here to force the command to wait before returning...
//    // Couldn't find a better way to run multiple commands in a loop and wait for them to complete.
//    setTimeout(function () {
//        deferred.resolve();
//    }, 6000);

//    return deferred.promise;
//});

//gulp.task('git-checkout', ['git-submodule-update'], function () {
//    var command = function (cwd) {
//        git.checkout('master');
//    };

//    var deferred = Q.defer();

//    // Switch to master branch in submodules (defaults to headless with no branch)
//    runCommandOnSubmodules(command);

//    // Switch to master branch in main repo (releases can only be done from this branch)
//    //command();

//    // This is here to force the command to wait before returning...
//    // Couldn't find a better way to run multiple commands in a loop and wait for them to complete.
//    setTimeout(function () {
//        deferred.resolve();
//    }, 6000);

//    return deferred.promise;
//});

//gulp.task('git-commit', function () {
//    //var command = 'git commit -a -m"Release version ' + version + '"';
//    //var command = function (cwd) {
//    //    gulp.src([cwd + '*.js', cwd + '*.json'])
//    //        .pipe(git.commit('Release version ' + version));
//    //};
//    var command = function (cwd) {
//        git.commit('Release version ' + version, { args: '-a' });
//    };

//    var deferred = Q.defer();

//    // Commit submodules
//    runCommandOnSubmodules(command);

//    // Commit main repo
//    command('./');

//    // This is here to force the command to wait before returning...
//    // Couldn't find a better way to run multiple commands in a loop and wait for them to complete.
//    setTimeout(function () {
//        deferred.resolve();
//    }, 6000);

//    return deferred.promise;
//});

//gulp.task('git-tag', ['git-commit'], function () {
//    var command = function (cwd) {
//        git.tag(version, 'Release version ' + version, { cwd: cwd });
//    };

//    var deferred = Q.defer();

//    // Tag submodules
//    runCommandOnSubmodules(command);

//    // Tag main repo
//    command();

//    // This is here to force the command to wait before returning...
//    // Couldn't find a better way to run multiple commands in a loop and wait for them to complete.
//    setTimeout(function () {
//        deferred.resolve();
//    }, 6000);

//    return deferred.promise;
//});

//gulp.task('git-update-submodule-final', ['git-tag'], function () {
//    var deferred = Q.defer();

//    git.updateSubmodule();

//    // This is here to force the command to wait before returning...
//    // Couldn't find a better way to run multiple commands in a loop and wait for them to complete.
//    setTimeout(function () {
//        deferred.resolve();
//    }, 6000);

//    return deferred.promise;
//});

//gulp.task('git-push', ['git-update-submodule-final'], function () {
//    var command = function (cwd) {
//        git.push('origin', 'master', { args: '--follow-tags' }, function (err) {
//            if (err) throw err;
//        });
//    };

//    // Temporarily use test branch
//    var command2 = function (cwd) {
//        git.push('origin', 'prototype-gulp-2', { args: '--follow-tags' }, function (err) {
//            if (err) throw err;
//        });
//    };

//    var deferred = Q.defer();

//    // Push submodules
//    runCommandOnSubmodules(command);

//    // Push main repo
//    command2();

//    // This is here to force the command to wait before returning...
//    // Couldn't find a better way to run multiple commands in a loop and wait for them to complete.
//    setTimeout(function () {
//        deferred.resolve();
//    }, 5000);

//    return deferred.promise;
//});

//gulp.task('nuget-pack', ['nuget-download', 'build'], function () {
//    console.log('build version: ' + version);
//    //console.log('nuget api key: ' + args.nugetApiKey);

//    var deferred = Q.defer();

//    var taskRootName = currentTask.name;
//    var orchestrator = new Orchestrator();
//    var taskNames = [];

//    // Get the nuspec files
//    var nuspecFiles = glob.sync("./**/*.nuspec");

//    console.log('Nuspec files: ' + nuspecFiles);

//    var nuspecLength = nuspecFiles.length;
//    for (var i = 0; i < nuspecLength; i++) {
//        var nuspecFile = nuspecFiles[i];
//        var taskName = taskRootName + nuspecFile;
//        var cwd = distributionFolder + nuspecFile;


//        orchestrator.add(taskName, function () {
//            return nugetPack(nuspecFile, nugetPath, version)
//        });

//        taskNames.push(taskName);
//    }

//    orchestrator.start(taskNames);

//    // This is here to force the command to wait before returning...
//    // Couldn't find a better way to run multiple commands in a loop and wait for them to complete.
//    setTimeout(function () {
//        deferred.resolve();
//    }, 2000);

//    return deferred.promise;
//});

//function nugetPack(nuspecFile, nugetPath, version) {
//    // Pack NuGet file
//    return gulp.src('', { base: './' })
//        .pipe(nuget.pack({ nuspec: nuspecFile, nuget: nugetPath, version: version }))
//        .pipe(rename(function (path) {
//            var baseName = path.basename;
//            var dirName = path.dirname;
//            if (dirName == 'helpers' || dirName == 'dialogs') {
//                path.basename = 'jquery.dirtyforms.' + dirName + '.' + baseName;
//            }
//            path.dirname = path.basename;
//        }))
//        .pipe(out(distributionFolder + '{basename}.nupkg'));
//};