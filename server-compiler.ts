const express = require('express');
const bodyParser = require('body-parser');
const fs = require("fs");
const gulp = require('gulp');
const ts = require('gulp-typescript');

const servePort = 4002;
const app = express();

app.use(bodyParser.text());
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


app.listen(servePort, function () {
	console.log('Example app listening on port '+servePort+'!')
});
