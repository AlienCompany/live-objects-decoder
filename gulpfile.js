var gulp = require('gulp');
var watch = require('gulp-watch');
var connect = require('gulp-connect');
var ts = require('gulp-typescript');
var tsProject = ts.createProject('tsconfig.json');
var servePort = 4000;
var fs = require("fs");
var open = require('gulp-open');

gulp.task('build-ts', function () {
    return tsProject.src()
        .pipe(tsProject())
        .js.pipe(gulp.dest('dist'));
});
gulp.task('copy-html', function () {
    return gulp.src('./src/**/*.html')
        .pipe(gulp.dest('./dist/'));
});
gulp.task('copy-css', function () {
    return gulp.src('./src/**/*.css')
        .pipe(gulp.dest('./dist/'));
});
gulp.task('build', gulp.parallel('build-ts', 'copy-html', 'copy-css'));
gulp.task('build-watch', gulp.series('build', function () {
    return watch('src/**', function () {
        console.log('watch detection');
        gulp.series('build')();
    })
}));
gulp.task('open-browser', function () {
    gulp.src(__filename)
        .pipe(open({uri: 'http://localhost:'+servePort}));
});
gulp.task('serve-start', function() {
    var express = require('express');
    var app = express();
    app.get('/decoders', function(req, res) {
        res.send(fs.readdirSync(__dirname+'/dist/decoders'));
    });

    return connect.server({
        root: 'dist',
        port: servePort,
        middleware: function(connect, opt) {
            return [app];
        }
    })
});
gulp.task('serve', gulp.parallel('serve-start', 'open-browser'));

gulp.task('dev', gulp.parallel('build-watch', 'serve'));

