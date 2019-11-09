declare const Swal: any;

type CompileStatus = 'success' | 'compiling' | 'failed' | 'unknown';
let lastCompileStatus: CompileStatus;
const setCompileStatus = function (newStatus: CompileStatus) {
	const jqCompileStatus = $('body, #compile-status');
	if (lastCompileStatus) jqCompileStatus.removeClass(lastCompileStatus);
	jqCompileStatus.addClass(lastCompileStatus = newStatus);

};

interface Decoder {
	type: 'ts' | 'js';
	fileName: string;
	navHtmlElement?: HTMLElement;
	js?: string;
	ts?: string;
}

interface TsCompileErrorPos {
	character: number;
	position: number;
	line: number
}

interface TsCompileError {
	message: string;
	startPosition: TsCompileErrorPos;
	endPosition: TsCompileErrorPos;
}

const extractDecoderFromScript = (script: string): string | ((string) => string) => {
	try {
		// @ts-ignore
		declare const decode: (string) => string;
		eval(script);
		if (typeof decode === typeof undefined) return 'la fonction decode n\'exist pas dans votre script';
		if (!decode || {}.toString.call(decode) !== '[object Function]') return 'decode doit étre une fonction';
		return decode;
	} catch (e) {
		setCompileStatus('failed');
		return 'Votre script ne compile pas :\n' + (e && e.stack) || JSON.stringify(e);
	}
};

$(() => {
	let decoders: Decoder[];
	let currentDecoder: Decoder;
	let editorCodeMirror: CodeMirror.Editor;
	let compiledCodeMirror: CodeMirror.Editor;
	let lastResult: { input: string, output?: string, error?: any }[] = [];
	let lastResultTable: string[][] = [];
	let selectedTestName: string;
	const noop = () => undefined;

	let compileIdInc = 0;

	type ResultDisplayFormat = 'string' | 'minimalist' | 'developed' | 'table' | 'tableDeveloped';
	let selectedResultDisplay: ResultDisplayFormat = 'developed';

	let nextCompile: () => Promise<void>;
	let compiling: boolean = false;
	const TsLint: CodeMirror.AsyncLinter = async (content: string, updateLintingCallback, options, codeMirror) => {
		const decoder = currentDecoder;
		if (decoder.type !== 'ts') return;
		let compileId = ++compileIdInc;
		setCompileStatus('compiling');
		nextCompile = async () => {
			nextCompile = null;
			compiling = true;
			try {
				decoder.js = await $.ajax({
					method: 'POST',
					url: `/compile/ts`,
					data: content,
					processData: false,
					dataType: 'text',
					contentType: 'text/plain',
				});
				updateLintingCallback(codeMirror, []);
				if (decoder === currentDecoder) {
					compiledCodeMirror.setValue(decoder.js);
				}
				if (compileId === compileIdInc) {
					if (decoder === currentDecoder) {
						await doTest();
					}
					setCompileStatus('success');
					compiling = false;
				} else {
					nextCompile();
				}
			} catch (e) {
				if (e.status == 409) {
					const errors: TsCompileError[] = JSON.parse(e.responseText)
					updateLintingCallback(codeMirror, errors.map(err => ({
						from: {
							ch: err.startPosition.character,
							line: err.startPosition.line
						},
						message: err.message,
						severity: 'error',
						to: {
							ch: err.endPosition.character,
							line: err.endPosition.line
						}
					})))
				}
				if (compileId === compileIdInc) {
					setCompileStatus('failed');
					compiling = false;
				} else {
					nextCompile();
				}
			}
		};
		if (!compiling) nextCompile().then(noop);

	};

	const defaultJsDecoderContent = ``;
	const defaultTsDecoderContent = ``;

	async function deleteDecoder(decoder: Decoder): Promise<void> {

		const fileName = decoder.fileName + '.' + decoder.type;

		await $.ajax({method: 'DELETE', url: `/src/decoders/${fileName}`});

		$(decoder.navHtmlElement).remove();
		decoders.splice(decoders.indexOf(decoder), 1);
	}

	function setTestErrorMsg(msg: string): void {
		$('#test-error')
			.css('display', msg ? 'block' : 'none')
			.find('.alert')
			.text(extractEvalSatck(msg) || '');

	}

	async function renameDecoder(decoder: Decoder, newName: string): Promise<void> {

		const fileName = decoder.fileName + '.' + decoder.type;
		const newFileName = newName + '.' + decoder.type;

		await $.ajax({method: 'PATCH', url: `/src/decoders/rename/${fileName}/${newFileName}`});

		decoder.fileName = newName;
		$(decoder.navHtmlElement).find('.fileName').text(newName);
	}

	async function copyDecoder(decoder: Decoder, newName: string) {

		const newFileName = newName + '.' + decoder.type;

		const source = await getSource(decoder);

		await $.ajax({
			method: 'PUT',
			url: `/src/decoders/${newFileName}`,
			data: source,
			processData: false,
			dataType: 'text',
			contentType: 'text/plain',
		});

		const newDecoder: Decoder = {
			fileName: newName,
			type: decoder.type
		};

		decoders.push(newDecoder);
		addDecoderToList(newDecoder);
	}

	async function uiDeleteDecoder(decoder: Decoder): Promise<void> {

		const {value: isConfirm} = await Swal.fire({
			title: 'Etes vous sur de vouloir supprimer le decoder ' + decoder.fileName,
			type: 'warning',
			showCancelButton: true,
			focusConfirm: true,
			confirmButtonText: 'Delete',
			cancelButtonText: 'Annuler',
		});

		if (isConfirm) {
			await deleteDecoder(decoder);
		}
	}

	async function uiRenameDecoder(decoder: Decoder): Promise<void> {
		const {value: newFileName} = await Swal.fire({
			title: 'Nouveau nom',
			input: 'text',
			inputValue: decoder.fileName,
			showCancelButton: true,
			inputValidator: (value) => {
				if (!value) {
					return 'Le nom ne doit pas étre vide'
				} else if (decoder.fileName !== value && decoders.some((d) => d.fileName === value)) {
					return 'Ce nom a déja étais utiliser';
				}
			}
		});

		if (newFileName && newFileName !== decoder.fileName) {
			await renameDecoder(decoder, newFileName);
		}
	}

	async function uiCopyDecoder(decoder: Decoder): Promise<void> {
		const {value: newFileName} = await Swal.fire({
			title: 'Nom de la copy',
			input: 'text',
			inputValue: decoder.fileName + '_copy',
			showCancelButton: true,
			inputValidator: (value) => {
				if (!value) {
					return 'Le nom ne doit pas étre vide'
				} else if (decoders.some((d) => d.fileName === value)) {
					return 'Ce nom a déja étais utiliser';
				}
			}
		});

		if (newFileName) {
			await copyDecoder(decoder, newFileName);
		}
	}

	async function saveDecoder(decoder: Decoder): Promise<void> {
		const newFileName = decoder.fileName + '.' + decoder.type;

		await $.ajax({
			method: 'POST',
			url: `/src/decoders/${newFileName}`,
			data: decoder[decoder.type],
			processData: false,
			dataType: 'text',
			contentType: 'text/plain',
		});
	}

	async function getSource(decoder: Decoder): Promise<string> {
		return $.get(`/src/decoders/${decoder.fileName}.${decoder.type}`)
	}

	async function selectDecoder(decoder: Decoder): Promise<void> {
		if (currentDecoder) {
			$(currentDecoder.navHtmlElement).removeClass('active')
		}
		$(decoder.navHtmlElement).addClass('active');
		currentDecoder = decoder;
		$('body')
			.removeClass(['current-js', 'current-ts'])
			.addClass('current-' + decoder.type);
		$('#current-decoder-title').text(decoder.fileName)

		decoder[decoder.type] = await getSource(decoder);

		editorCodeMirror.setValue(decoder[decoder.type]);
		editorCodeMirror.setOption('mode', decoder.type === 'js' ? 'javascript' : 'text/typescript');
		editorCodeMirror.setOption('lint', decoder.type === 'js' ? true : {async: true, getAnnotations: TsLint});

		if (decoder.type === 'js') {
			doTest();
		} else {
			compiledCodeMirror.setValue(decoder.js || '');
		}
	}

	async function newDecoder() {
		const inputName = $('#add-decoder-name');
		const inputType = $('#add-decoder-type');
		const decoder: Decoder = {
			type: inputType.val() as 'js' | 'ts',
			fileName: inputName.val() as string
		};

		await $.ajax({
			type: 'PUT', url: `/src/decoders/${decoder.fileName}.${decoder.type}`,
			data: decoder.type === 'js' ? defaultJsDecoderContent : defaultTsDecoderContent,
			processData: false,
			dataType: 'text',
			contentType: 'text/plain',
		});

		decoders.push(decoder);
		addDecoderToList(decoder);
		inputName.val('');
	}

	function addDecoderToList(decoder: Decoder) {

		const decodersContenaire = $('#decoders-list')[0];
		const domBtn = $(`
<button class="btn btn-script">
	<span class="fileName">${decoder.fileName}</span>
	<span class="badge badge-${decoder.type === 'ts' ? 'info' : 'warning'}">${decoder.type === 'ts' ? 'TypeScript' : 'JavaScript'}</span>
	<a title="Renomer" class="material-icons float-right rename">edit</a>
	<a title="Copyer" class="material-icons float-right copy">file_copy</a>
	<a title="Suprimer" class="material-icons float-right delete">delete</a>
</button>`);
		domBtn.on('click', () => location.hash = decoder.fileName);
		domBtn.on('click', () => location.hash = decoder.fileName);
		domBtn.find('.rename').on('click', (event) => {
			event.stopPropagation();
			uiRenameDecoder(decoder)
		});
		domBtn.find('.delete').on('click', (event) => {
			event.stopPropagation();
			uiDeleteDecoder(decoder)
		});
		domBtn.find('.copy').on('click', (event) => {
			event.stopPropagation();
			uiCopyDecoder(decoder)
		});
		decoder.navHtmlElement = domBtn[0];
		decodersContenaire.append(decoder.navHtmlElement);
	}

	async function doTest() {
		const values = getTestValues();
		if (currentDecoder.type === 'js') {
			setCompileStatus('success');
		}
		const decoder = extractDecoderFromScript(currentDecoder.js);
		if (typeof decoder === 'string') {
			setTestErrorMsg(decoder);
			return;
		}
		if (!values.length) {
			setTestErrorMsg('Veulliez lister les trams a decoder');
			return;
		}
		setTestErrorMsg(null);
		lastResult = values.map((input) => {
			try {
				const output = decoder(input);
				if (typeof output !== 'string') {
					return {input, error: new Error('Result is not a string! (out type= ' + typeof output + ')')};
				}
				try {
					JSON.parse(output); // check if JSON
					return {input, output};
				} catch (e) {
					return {
						input,
						error: new Error('The string result don\'t contain a JSON\n' + e.message + '\n' + 'result = ' + output)
					}
				}
			} catch (error) {
				return {input, error}
			}
		});

		lastResult.map(res => res.error).filter(_ => _).forEach((err) => console.error(err));

		renderResult();

	}

	function extractEvalSatck(stack: string): string {
		if (typeof stack !== 'string') return stack;
		return stack.split('\n').map((line) => {
			if (!/^[\ \\]+at\ /.test(line)) return line;
			const res = /^(.*)\(eval at[^\,]+,(.*)$/.exec(line);
			if (!res) return null;
			return res[1] + '(' + res[2];
		}).filter(_ => _).join('\n');
	}

	function renderResult() {
		$('.simple-result').css('display', lastResult.length === 1 ? 'block' : 'none');
		$('.multi-result').css('display', lastResult.length > 1 ? 'block' : 'none');

		const jsonSeparator = selectedResultDisplay === 'developed' || selectedResultDisplay === 'tableDeveloped' ? '    ' : undefined;
		const isTable = selectedResultDisplay === 'table' || selectedResultDisplay === 'tableDeveloped';

		const errToStr = (err) => extractEvalSatck(err.stack) || JSON.stringify(err, undefined, jsonSeparator);
		const outToStr = (out) => JSON.stringify(out, undefined, jsonSeparator);
		lastResultTable = [];

		if (lastResult.length === 1) {
			const outPutParsed = !lastResult[0].error && JSON.parse(lastResult[0].output);
			if (lastResult[0].error) {
				$('#simple-value-result')
					.addClass('value-error')
					.text(errToStr(lastResult[0].error))
			} else if (isTable) {
				const tableKey = Object.keys(outPutParsed);
				const tableValue = tableKey.map((k) => outToStr(outPutParsed[k]));
				lastResultTable.push(tableKey);
				lastResultTable.push(tableValue);
				const header = '<tr><th>' + tableKey.join('</th><th>') + '</th></tr>';
				const body = $('<tr></tr>');
				tableValue.forEach((value) => body.append($('<td></td>').text(value)));
				const table = $('<table></table>');
				table.append(header).append(body);
				$('#simple-value-result')
					.removeClass('value-error')
					.html('')
					.append(table);
			} else if (selectedResultDisplay === 'string') {
				$('#simple-value-result')
					.removeClass('value-error')
					.text(lastResult[0].output)
			} else {
				$('#simple-value-result')
					.removeClass('value-error')
					.text(outToStr(outPutParsed))
			}
		} else if (lastResult.length > 1) {
			if (isTable) {
				const tableKeySet = new Set<string>();
				lastResult.forEach(res => res.error || Object.keys(JSON.parse(res.output)).forEach((key) => tableKeySet.add(key)));
				const tableKey = Array.from(tableKeySet.values());
				lastResultTable.push(['Tram', ...tableKey]);
				const table = $(`<table><tr><th>Tram</th><th>${tableKey.join('</th><th>')}</th></tr></table>`);
				lastResult.map(resRow => {
					const isError = !!resRow.error;
					const row = $(`<tr><td>${resRow.input}</td></tr>`);
					if (isError) {
						row.append('<td class="pre multi-res-val value-error" colspan="' + tableKey.length + '">' + errToStr(resRow.error) + '</td>');
						row.addClass('row-error');
						lastResultTable.push([resRow.input, errToStr(resRow.error)]);
					} else {
						const output = JSON.parse(resRow.output);
						tableKey.forEach((key) => {
							row.append($('<td class="pre multi-res-val"></td>').text(outToStr(output[key])));
						});
						lastResultTable.push([resRow.input, ...tableKey.map((k) => outToStr(output[k]))]);
					}
					table.append(row);
				});
				$('#multi-value-result').html('').append(table);

			} else {
				const table = $(`<table><tr><th>Tram</th><th>Sortie</th></tr></table>`);
				lastResultTable.push(['Tram', 'Sortie']);
				lastResult.map(resRow => {
					const isError = !!resRow.error;
					const showedText = isError ? errToStr(resRow.error) : selectedResultDisplay === 'string' ? resRow.output : outToStr(JSON.parse(resRow.output));
					lastResultTable.push([resRow.input, showedText]);
					const row = $(`<tr class="${isError ? 'row-error' : ''}"><td>${resRow.input}</td><td class="pre multi-res-val${isError ? ' value-error' : ''}"></td></tr>`);
					row.find('.multi-res-val').text(showedText);
					table.append(row);
				});
				$('#multi-value-result').html('').append(table);
			}
		}
		$('#download-csv').css('display', lastResultTable.length ? 'inline-block' : 'none');
	}

	function toCsv(table: string[][]) {

		const strToStrCsv = (str) => '"' + str.replace(/"/g, '""') + '"';
		return table.map(row => row.map(strToStrCsv).join(',')).join('\n')
	}

	function getTestValues() {
		const inputVal = $('#test-value').val() as string;
		return inputVal.replace(/[^A-Za-z0-9]+/g, ',')
			.split(',')
			.filter(v => v);

	}

	function initJeuDeTest() {
		let testMap = JSON.parse(localStorage.getItem('test-list')) as { [name: string]: string[] } || {};
		const lastInput = localStorage.getItem('test-lastInput') || '';
		const lastSelection = localStorage.getItem('test-lastSelected');

		const jqTestInput = $('#test-value');
		jqTestInput.val(lastInput).on('change', () => localStorage.setItem('test-lastInput', jqTestInput.val() as string));

		const listKey = Object.keys(testMap);
		const changeSelectedName = (name) => {
			selectedTestName = name;
			localStorage.setItem('test-lastSelected', name);
			$('#dropdownTest').text(name || 'Choisir un jeu de test');
			if (name) {
				$('#test-save').removeClass('disabled');
				$('#test-delete').removeClass('disabled');
			} else {
				$('#test-save').addClass('disabled');
				$('#test-delete').addClass('disabled');
			}
		};
		if (lastSelection && testMap[lastSelection]) {
			changeSelectedName(lastSelection);
		}

		const btns: { [testName: string]: JQuery<HTMLElement> } = {};

		const addTestBt = (testName) => {
			btns[testName] = $(' <button class="dropdown-item" type="button">' + testName + '</button>')
				.on('click', () => {
					changeSelectedName(testName);
					jqTestInput.val(testMap[testName].join(' '));
					localStorage.setItem('test-lastInput', jqTestInput.val() as string)
					doTest();
				})
			$('#jeux-de-test .dropdown-menu').append(btns[testName]);
		};
		listKey.forEach(addTestBt);
		if (!listKey.length) {
			$('#jeux-de-test .dropdown-menu').text('Pas de jeux de test enregistrer');
		}

		$('#test-save').on('click', () => {
			if (selectedTestName) {
				const memTestMap = JSON.parse(localStorage.getItem('test-list')) || {};
				memTestMap[selectedTestName] = testMap[selectedTestName] = getTestValues();
				localStorage.setItem('test-list', JSON.stringify(memTestMap));
			}
		});
		$('#test-save-as').on('click', async () => {
			const {value: name} = await Swal.fire({
				title: 'Nom du test',
				input: 'text',
				inputValue: selectedTestName || '',
				showCancelButton: true,
				inputValidator: (value) => {
					if (!value) {
						return 'Le nom ne doit pas étre vide';
					} else if (testMap[value]) {
						return 'Ce nom a déja étais utiliser';
					}
				}
			});
			if (name) {
				if (!Object.keys(testMap).length) $('#jeux-de-test .dropdown-menu').html('');
				const memTestMap = JSON.parse(localStorage.getItem('test-list')) || {};
				memTestMap[name] = testMap[name] = getTestValues();
				localStorage.setItem('test-list', JSON.stringify(memTestMap));
				addTestBt(name);
				changeSelectedName(name);
			}
		})
		$('#test-delete').on('click', () => {
			if (selectedTestName) {
				const memTestMap = JSON.parse(localStorage.getItem('test-list')) || {};
				delete memTestMap[selectedTestName];
				delete testMap[selectedTestName];
				localStorage.setItem('test-list', JSON.stringify(memTestMap));
				btns[selectedTestName].remove();
				changeSelectedName(null);
				if (!Object.keys(testMap).length) $('#jeux-de-test .dropdown-menu').text('Pas de jeux de test enregistrer');
			}
		})

	}

	async function init() {
		editorCodeMirror = CodeMirror($('#editor-content')[0], {
			lineNumbers: true,
			// mode: "javascript",
			mode: 'text/typescript',
			gutters: ['CodeMirror-lint-markers'],
			lineWrapping: false,
			lint: true
		});

		compiledCodeMirror = CodeMirror($('#compiled-content')[0], {
			lineNumbers: true,
			mode: 'javascript',
			readOnly: 'nocursor',
			showCursorWhenSelecting: false
		});

		const decodersFileName: string[] = await $.get('src/decoders');
		decoders = decodersFileName
			.map((file) => /^(.*)\.(js|ts)$/.exec(file))
			.filter(_ => _)
			.map(regExpGroups => ({
				fileName: regExpGroups[1],
				type: regExpGroups[2]
			} as Decoder));
		decoders.forEach((decoder) => addDecoderToList(decoder));

		$('#decoders form').on('submit', (e) => {
			e.preventDefault();
			newDecoder();
		})
		$('#decoders form select').on('change', () => newDecoder());
		$('#test-value').on('input', () => doTest());
		$('#result-format').on('change', () => {
			selectedResultDisplay = $('#result-format').val() as ResultDisplayFormat;
			renderResult();
		});

		$('.col-separator').on('mousedown', function (e) {
			e.stopPropagation();
			const target = $('#' + $(this).attr('target'));
			const revertAttr = $(this).attr('revert');
			const initWith = target.width();
			const initMouseX = e.clientX;
			const factor = (typeof revertAttr !== typeof undefined) ? -1 : 1;
			const moveHandler = (e) => {
				target.width(initWith + (e.clientX - initMouseX) * factor);
				e.stopPropagation();
			};
			const mouseupHandler = (e) => {
				$(document).off('mousemove', moveHandler);
				$(document).off('mouseup', mouseupHandler);
				e.stopPropagation();
			};
			$(document).on('mousemove', moveHandler);
			$(document).on('mouseup', mouseupHandler)

		})
		initJeuDeTest();

		let lastTimeOut: any;
		editorCodeMirror.on('change', () => {
			if (lastTimeOut != null) clearTimeout(lastTimeOut);
			lastTimeOut = setTimeout(() => {
				if (editorCodeMirror.getValue() !== currentDecoder[currentDecoder.type]) {
					currentDecoder[currentDecoder.type] = editorCodeMirror.getValue();
					saveDecoder(currentDecoder);
					if (currentDecoder.type === 'js') {
						doTest();
					}
				}
			}, 500);
		});
		$('#download-csv').on('click', () => {
			download('decoderResult.csv', toCsv(lastResultTable));
		});
		$('#editor-tab-ts').on('click', () => {
			debugger;
			$('#editor-tab-ts').addClass('active');
			$('#editor-tab-js').removeClass('active');
			$('body').removeClass('show-compile');
		});
		$('#editor-tab-js').on('click', () => {
			debugger;
			$('#editor-tab-js').addClass('active');
			$('#editor-tab-ts').removeClass('active');
			$('body').addClass('show-compile');
			compiledCodeMirror.refresh();
		});
		$('#download-js').on('click', () => {
			if (currentDecoder.type === 'ts' && lastCompileStatus !== 'success') return;
			download(currentDecoder.fileName + '.js', currentDecoder.js);

		})
		$('#download-ts').on('click', () => {
			download(currentDecoder.fileName + '.ts', currentDecoder.ts);

		})

		selectDecoderFromAnchor();
		window.addEventListener('hashchange', () => selectDecoderFromAnchor());
		renderResult();
	}

	function download(filename: string, content: string): void {
		saveAs(new Blob([content], {
			type: "text/plain;charset=utf-8"
		}), filename);
	}

	function getAnchor(): string {
		return window.location.hash.substr(1);
	}

	function selectDecoderFromAnchor(): void {
		const anchor = getAnchor();
		const anchorDecoder = decoders.find((d) => d.fileName === anchor) || decoders[0];
		if (anchorDecoder !== currentDecoder) {
			selectDecoder(anchorDecoder);
		}
	}

	init().then(noop)

	$('[propageFocus]')
		.on('focus', function () {
			$(this).parents().addClass('focused');
		})
		.on('blur', function () {
			$(this).parents().removeClass('focused');
		});

});
