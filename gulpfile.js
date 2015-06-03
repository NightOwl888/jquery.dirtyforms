var gulp = require('gulp'),
    nuget = require('gulp-nuget'),
	uglify = require('gulp-uglify'),
	out = require('gulp-out'),
    jshint = require('gulp-jshint'),
    stylish = require('jshint-stylish'),
    concat = require('gulp-concat'),
    rename = require('gulp-rename'),
    sourcemaps = require('gulp-sourcemaps'),
	request = require('request'),
    fs = require('fs'),
	rimraf = require('rimraf'),
    bump = require('gulp-bump'),
    tap = require('gulp-tap'),
    runSequence = require('run-sequence'),
    run = require('gulp-run');
var args = require('yargs').argv;
// All of the module names (individual releases) for the build
var modules = ['jquery.dirtyforms' /*, 'jquery.dirtyforms.helpers.tinymce', 'jquery.dirtyforms.helpers.ckeditor'*/];
var distributionFolder = './dist/jquery.dirtyforms/';
var version = getPackageJsonVersion();

//gulp.task('default', ['clean', 'build', 'nuget'], function() {

//});

gulp.task('default', ['init', 'clean', 'build'], function () {

});

gulp.task('init', function () {
    // Set the version number
    var argsVersion = args.version;

    console.log('config version: ' + version);
    console.log('args version: ' + argsVersion);

    // Override the version number with the CLI argument --version=1.2.3
    if (typeof (argsVersion) !== 'undefined') {
        version = argsVersion;
    }

    // Prepare the module arrays based on helpers and dialogs directories
    var helperNames = fs.readdirSync('./helpers');
    var names = [];

    gulp.src(helperNames)
        .pipe(rename('{basename}'))
        .pipe(names);
    console.log('helpers: ' + helperNames);
    console.log('helpers: ' + names);
});

gulp.task('clean',  function(cb) {
    rimraf(distributionFolder + '*.js', cb);
});

gulp.task('build', ['init', 'uglify'], function () {

});

gulp.task('uglify',  function() {
	// Compress js
    //gulp.src(['./jquery.dirtyforms.js'], { base: './' })
    //    .pipe(uglify())
    //    .pipe(out('./dist/{basename}.min{extension}'));
    //gulp.src(['./dist/jquery.dirtyforms/jquery.dirtyforms.js'])
    //    .pipe(uglify())
    //    .pipe(out('{basename}.min{extension}'));

    //gulp.src(['./jquery.dirtyforms.js'])
    //    .pipe(uglify())
    //    .pipe(out('./dist/jquery.dirtyforms/{basename}.min{extension}'));

    // v1.0.0
    //gulp.src(['./jquery.dirtyforms.js'], { base: './' })
    //    .pipe(jshint())
    //    .pipe(jshint.reporter(stylish))
    //    .pipe(out(distributionFolder + 'jquery.dirtyforms.js'))
    //    .pipe(uglify())
    //    .pipe(out(distributionFolder + '{basename}.min{extension}'));

    return gulp.src(['./jquery.dirtyforms.js', './helpers/**/!(alwaysdirty).js'], { base: './' })
        .pipe(jshint())
        .pipe(jshint.reporter(stylish))
        .pipe(concat('jquery.dirtyforms.js', { newLine: '\n' }))
        .pipe(gulp.dest(distributionFolder))
        //.pipe(sourcemaps.init())
        .pipe(rename('jquery.dirtyforms.min.js'))
        .pipe(uglify())
        //.pipe(gulp.dest(distributionFolder))
        ////.pipe(rename('jquery.dirtyforms.min'))
        //.pipe(sourcemaps.write('../jquery.dirtyforms'))
        ////.pipe(sourcemaps.write('./jquery.dirtyforms.min.map'))
        .pipe(gulp.dest(distributionFolder));
});

gulp.task('nuget', ['download-nuget'], function() {
	console.log('build version: ' + version);
	console.log('nuget api key: ' + args.nugetApiKey);

	// Pack NuGet file
    //var nugetPath = './tools/nuget/nuget.exe';
	var nugetPath = 'nuget.exe';

    gulp.src('')
        .pipe(nuget.pack({ nuspec: './jquery.dirtyforms.nuspec', nuget: nugetPath, version: version }))
        .pipe(out('./dist/{basename}.nupkg'));
});

gulp.task('download-nuget',  function() {
	if(fs.existsSync('nuget.exe')) {
        done();
        return;
    }

    return request.get('http://nuget.org/nuget.exe')
        .pipe(fs.createWriteStream('nuget.exe'))
        .on('close', done);
});

gulp.task('bump-version', ['init'], function () {
    var argsVersion = args.version;
    var buildType = args.buildType;

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
            .pipe(bump({ version: version }))
            .pipe(gulp.dest('./'));
    }
});

gulp.task('bump', ['bump-version'], function () {
    console.log('Successfully bumped version to: ' + version);
});

gulp.task('git-version', function () {
    run('git --version').exec()   
});

gulp.task('release-prepare', function () {
    run('git submodule init').exec();
    run('git submodule update').exec();

    var command = 'git checkout master';

    // Switch to master branch in submodules (defaults to headless with no branch)
    runCommandOnSubmodules(command);

    // Switch to master branch in main repo (releases can only be done from this branch)
    //run(command).exec();
});

gulp.task('git-commit', function () {
    var command = 'git commit -a -m"Release version ' + version + '"';

    // Commit submodules
    runCommandOnSubmodules(command);

    // Commit main repo
    run(command).exec();
});

gulp.task('git-tag'/*, ['git-commit'] */, function () {
    var command = 'git tag ' + version + ' -m"Release version ' + version + '"';

    // Tag submodules
    runCommandOnSubmodules(command);

    // Tag main repo
    run(command).exec();

    run('git submodule update').exec();
});

gulp.task('git-push'/*, ['git-tag'] */, function () {
    var command = 'git push';

    // Tag submodules
    runCommandOnSubmodules(command);

    // Tag main repo
    run(command).exec();
});

//gulp.task('git-push'/*, ['git-tag'] */, function () {
//    var command = 'git push';

//    // Tag submodules
//    runCommandOnSubmodules(command);

//    // Tag main repo
//    run(command).exec();
//});


function done() { }

function runCommandOnSubmodules(command) {
    var modulesLength = modules.length;
    for (var i = 0; i < modulesLength; i++) {
        var module = modules[i];
        run('cd dist/' + module + ' && ' + command).exec();
    }
};

function getPackageJsonVersion() {
    //We parse the json file instead of using require because require caches multiple calls so the version number won't be updated
    return JSON.parse(fs.readFileSync('./package.json', 'utf8')).version;
};