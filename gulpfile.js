const gulp = require('gulp');
const watch = require('gulp-watch');
const connect = require('gulp-connect');
const ts = require('gulp-typescript');
const tsProject = ts.createProject('tsconfig.json');
const servePort = 4000;
const fs = require("fs");
const open = require('gulp-open');
const sass = require('gulp-sass');
const bodyParser = require('body-parser')

gulp.task('build-ts', function () {
    return tsProject.src()
        .pipe(tsProject())
        .js.pipe(gulp.dest('dist'));
});
gulp.task('copy-html', function () {
    return gulp.src('./src/**/*.html')
        .pipe(gulp.dest('./dist/'));
});
gulp.task('build-sass', function () {
    return gulp.src('./src/**/*.scss')
        .pipe(sass().on('error', sass.logError))
        .pipe(gulp.dest('./dist'));
});
gulp.task('build', gulp.parallel('build-ts', 'copy-html', 'build-sass'));
gulp.task('build-watch', gulp.series('build', function () {
    return watch('src/**', function () {
        console.log('watch detection');
        gulp.series('build')();
    })
}));
gulp.task('open-browser', function () {
    gulp.src(__filename)
        .pipe(open({uri: 'http://localhost:' + servePort}));
});
gulp.task('serve-start', function () {
    const express = require('express');
    const app = express();

    app.use('/src', express.static(__dirname + '/src'));
    app.use(bodyParser.text());

    app.get('/decoders', function (req, res) {
        res.send(fs.readdirSync(__dirname + '/src/decoders'));
    });
    app.patch('/src/decoders/rename/:fileName/:newFileName', function (req, res) {
        const from = __dirname + '/src/decoders/' + req.params.fileName;
        const to = __dirname + '/src/decoders/' + req.params.newFileName;
        if (!fs.existsSync(from)) {
            res.send(404, 'Script not found');
            return;
        }
        if(fs.existsSync(to)){
            res.send(409, 'Script already exist');
            return;
        }

        fs.renameSync(from, to);
        res.send('Rename done');

    });
    app.post('/src/decoders/:fileName', function (req, res) {
        const file = __dirname + '/src/decoders/' + req.params.fileName;
        const content = req.body;

        if (fs.existsSync(file)) {
            fs.writeFileSync(file, content, 'utf8');
        } else {
            res.send(404, 'Script not found');
            return;
        }
        res.send('saved');
    });
    app.put('/src/decoders/:fileName', function (req, res) {
        const file = __dirname + '/src/decoders/' + req.params.fileName;
        const content = req.body;

        if (!fs.existsSync(file)) {
            fs.writeFileSync(file, content, 'utf8');
        } else {
            res.send(409, 'Script already exist');
            return;
        }
        res.send('saved');
    });
    app.delete('/src/decoders/:fileName', function (req, res) {
        const file = __dirname + '/src/decoders/' + req.params.fileName;

        if (fs.existsSync(file)) {
            fs.unlinkSync(file);
        } else {
            res.send(404, 'Script not found');
            return;
        }

        res.send('deleted');
    });

    return connect.server({
        root: 'dist',
        port: servePort,
        middleware: function (connect, opt) {
            return [app];
        }
    })
});
gulp.task('serve', gulp.parallel('serve-start', 'open-browser'));

gulp.task('dev', gulp.parallel('build-watch', 'serve'));

