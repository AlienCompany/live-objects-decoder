const gulp = require('gulp');
const watch = require('gulp-watch');
const connect = require('gulp-connect');
const ts = require('gulp-typescript');
const tsProject = ts.createProject('tsconfig.json');
const servePort = 4000;
const fs = require("fs");
const open = require('gulp-open');
const sass = require('gulp-sass');
const bodyParser = require('body-parser');
const Readable = require('stream').Readable;
const Vinyl = require('vinyl');

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
    return gulp.src('./src/**/*.js')
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
gulp.task('build', gulp.parallel('build-ts', 'copy-html', 'build-sass', 'codemirror'));
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
        if (fs.existsSync(to)) {
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
    app.post('/compile/ts', function (req, res) {

        let data = "";
        let errorSent = false;
        let cErrors = [];
        let os = require('os');

        const tmpFile = os.tmpdir()+'/live-objects-decoder-compile_'+(Math.random()*100000000).toFixed(0)+'.ts';
        fs.writeFileSync(tmpFile, req.body);
        gulp.src(tmpFile)
            .on('error', (e) => {
                res.send(500, e.stack);
            })
            .pipe(ts({
                    target: 'es5'
                },
                {
                    error: (error, typescript) => {
                        cErrors.push({
                            message: error.diagnostic.messageText,
                            startPosition: error.startPosition,
                            endPosition: error.endPosition,
                        });
                    },
                    finish: (results) => {
                        if(cErrors.length){
                            res.send(409, cErrors);
                            errorSent = true;
                        }
                    }
                }))
            .on('error', (e) => {
                if(errorSent) return;
                res.send(500, e.stack);
                errorSent = true;
            })
            .on('finish', () => {
                if (!errorSent) res.send(data);
            })
            .js
            .on('data', (r, a, b) => {
                data += r.contents.toString();
            })
            .on('error', (e) => {
                res.send(500, e.stack);
            });
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

// gulp.task('dev', gulp.parallel('build-watch', 'serve'));
gulp.task('dev', gulp.parallel('build-watch', 'serve-start'));

