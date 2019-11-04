const express = require('express');
const bodyParser = require('body-parser');
const fs = require("fs");

const servePort = 4001;
const app = express();

app.use('/src', express.static(__dirname + '/src'));
app.use(bodyParser.text());

app.get('/src/decoders', function (req, res) {
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

app.listen(servePort, function () {
	console.log('Example app listening on port '+servePort+'!')
});
