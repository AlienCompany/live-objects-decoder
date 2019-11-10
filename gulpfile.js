const gulp = require('gulp');
const watch = require('gulp-watch');
const ts = require('gulp-typescript');
const tsProject = ts.createProject('tsconfig.json');
const open = require('gulp-open');
const sass = require('gulp-sass');
const proxy = require('http-proxy-middleware');
const servePort = 4000;
const exec = require('child_process').exec;
const connect = require('gulp-connect');

gulp.task('build-ts', function () {
    return tsProject.src()
        .pipe(tsProject())
        .js.pipe(gulp.dest('dist'));
});
gulp.task('copy-html', function () {
    return gulp.src('./src/**/*.html')
        .pipe(gulp.dest('./dist/'));
});
gulp.task('copy-js', function () {
    return gulp.src(['./node_modules/file-saver/dist/*.js'])
        .pipe(gulp.dest('./dist/'));
});
gulp.task('codemirror-core', function () {
    return gulp.src('./node_modules/codemirror/lib/codemirror.*')
        .pipe(gulp.dest('./dist/codemirror/'));
});
gulp.task('codemirror-mode', function () {
    return gulp.src('./node_modules/codemirror/mode/javascript/*')
        .pipe(gulp.dest('./dist/codemirror/mode/'));
});
gulp.task('codemirror-addon', function () {
    return gulp.src([
        './node_modules/codemirror/addon/lint/lint.js',
        './node_modules/codemirror/addon/lint/javascript-lint.js',
        './node_modules/codemirror/addon/hint/javascript-hint.js',
        './node_modules/codemirror/addon/lint/lint.css'
    ])
        .pipe(gulp.dest('./dist/codemirror/addon/'));
});
gulp.task('codemirror-theme', function () {
    return gulp.src('./node_modules/codemirror/theme/*')
        .pipe(gulp.dest('./dist/codemirror/theme/'));
});
gulp.task('codemirror', gulp.parallel('codemirror-core', 'codemirror-theme', 'codemirror-mode', 'codemirror-addon'));
gulp.task('build-sass', function () {
    return gulp.src('./src/**/*.scss')
        .pipe(sass().on('error', sass.logError))
        .pipe(gulp.dest('./dist'));
});
gulp.task('build', gulp.parallel('build-ts', 'copy-html', 'copy-js', 'build-sass', 'codemirror'));
gulp.task('build-watch', gulp.series('build', function () {
    return watch('src/*', function () {
        console.log('watch detection');
        gulp.series('build')();
    })
}));
gulp.task('open-browser', function () {
    gulp.src(__filename)
        .pipe(open({uri: 'http://localhost:' + servePort}));
});
gulp.task('serve-src-start', function () {
    return exec('ts-node server-src.ts')
});
gulp.task('serve-compiler-start', function () {
    return exec('ts-node server-compiler.ts')
});
gulp.task('serve-proxy-start', function () {
    return connect.server({
        root: 'dist',
        port: servePort,
        middleware: function(connect, opt) {
            return [
                proxy('/src', {
                    target: 'http://localhost:4001',
                    changeOrigin:true
                }),
                proxy('/compile', {
                    target: 'http://localhost:4002',
                    changeOrigin:true
                })
            ]
        }
    })
});
gulp.task('serves-start', gulp.parallel('serve-src-start', 'serve-compiler-start', 'serve-proxy-start'));
gulp.task('serve', gulp.parallel('serves-start', 'open-browser'));

// gulp.task('dev', gulp.parallel('build-watch', 'serve'));
gulp.task('dev', gulp.parallel('build-watch', 'serves-start'));
gulp.task('start', gulp.series('build', 'serve'));

