declare const Swal: any;

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

const extractDecoderFromScript = (script: string): string | ((string)=> string) => {
	try {
		// @ts-ignore
		declare const decode: (string)=> string;
		eval(script);
		if(typeof decode === typeof undefined) return "la fonction decode n'exist pas dans votre script";
		if(!decode || {}.toString.call(decode) !== '[object Function]') return "decode doit étre une fonction";
		return decode;
	}catch (e) {
		return "Votre script ne compile pas :\n" + (e && e.stack) || JSON.stringify(e);
	}
}

$(() => {
	let decoders: Decoder[];
	let currentDecoder: Decoder;
	let editorCodeMirror: CodeMirror.Editor;
	let lastResult: {input: string, output?: string, error?:any}[] = [];
	let jsonSeparator: string = '\t';
	const noop = () => undefined;

	const TsLint: CodeMirror.AsyncLinter = async (content: string, updateLintingCallback, options, codeMirror) => {
		console.log(content, updateLintingCallback, options, codeMirror);
		const decoder = currentDecoder;
		if (!decoder.type || decoder.type !== 'ts') return;
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
			if(decoder === currentDecoder){
				await doTest();
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
			console.log(e)
		}
	};

	const defaultJsDecoderContent = ``;
	const defaultTsDecoderContent = ``;

	async function deleteDecoder(decoder: Decoder): Promise<void> {

		const fileName = decoder.fileName + '.' + decoder.type;

		await $.ajax({method: 'DELETE', url: `/src/decoders/${fileName}`});

		$(decoder.navHtmlElement).remove();
		decoders.splice(decoders.indexOf(decoder), 1);
	}

	function setTestErrorMsg(msg: string): void{
		$('#test-error')
			.css('display', msg? 'block': 'none')
			.find('.alert')
			.text(msg||'');

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

		decoder[decoder.type] = await getSource(decoder);

		editorCodeMirror.setValue(decoder[decoder.type]);
		editorCodeMirror.setOption('mode', decoder.type === 'js' ? 'javascript' : 'text/typescript');
		editorCodeMirror.setOption('lint', decoder.type === 'js' ? true : {async: true, getAnnotations: TsLint});
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
		location.hash = decoder.fileName;
	}

	async function doTest(){
		const values = getTestValues();
		const decoder = extractDecoderFromScript(currentDecoder.js);
		if(typeof decoder === 'string'){
			setTestErrorMsg(decoder);
			return;
		}
		setTestErrorMsg(null);
		lastResult = values.map((input)=>{
			try {
				const out = decoder(input);
				if(typeof out !== 'string'){
					return {input, error: new Error('Result is not a string! (out type= ' + typeof out + ')')};
				}
				try{
					return {input, output: JSON.parse(out)};
				}catch (e) {
					return {input, error: new Error('The string result don\'t contain a JSON\n'+e.message+'\n'+'result = '+out)}
				}
			}catch (error) {
				return {input, error}
			}
		});

		lastResult.map(res=>res.error).filter(_=>_).forEach((err)=>console.error(err));

		renderResult();

	}

	function extractEvalSatck(stack: string): string{
		if(typeof stack !== 'string') return stack;
		return stack.split('\n').map((line)=>{
			if(!/^[\ \\]+at\ /.test(line))return line;
			const res = /^(.*)\(eval at[^\,]+,(.*)$/.exec(line);
			if(!res) return null;
			debugger;
			return res[1]+'('+res[2];
		}).filter(_=>_).join('\n');
	}

	function renderResult() {
		$('.simple-result').css('display', lastResult.length === 1 ? 'block' : 'none');
		$('.multi-result').css('display', lastResult.length > 1 ? 'block' : 'none');

		const errToStr = (err)=>extractEvalSatck(err.stack) || JSON.stringify(err, undefined, jsonSeparator);
		const outToStr = (out)=>typeof out === 'string'? out : JSON.stringify(out, undefined, jsonSeparator);

		if(lastResult.length === 1){
			if(lastResult[0].error){
				$('#simple-value-result')
					.addClass('value-error')
					.text(errToStr(lastResult[0].error))
			}else {
				$('#simple-value-result')
					.removeClass('value-error')
					.text(outToStr(lastResult[0].output))
			}
		}else if(lastResult.length > 1){
			const table = $(`<table></table>`);
			lastResult.map(resRow => {
				const isError = !!resRow.error;
				const showedText = isError? errToStr(resRow.error): outToStr(resRow.output);
				const row = $(`<tr><td>${resRow.input}</td><td class="pre multi-res-val${isError?' value-error': ''}"></td></tr>`);
				row.find('.multi-res-val').text(showedText)
				table.append(row);
			});
			$('#multi-value-result').html('').append(table);
		}
	}

	function getTestValues(){
		const inputVal = $('#test-value').val() as string;
		return inputVal.replace(/[^A-Za-z0-9]+/g, ',')
			.split(',')
			.filter(v=>v);

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
		$('#result-developed').on('change', ()=>{
			jsonSeparator = $('#result-developed').is(":checked") ? '\t' : undefined;
			renderResult();
		});

		$('.col-separator').on('mousedown', function(e){
			e.stopPropagation();
			const target = $('#'+$(this).attr('target'));
			const revertAttr = $(this).attr('revert');
			const initWith = target.width();
			const initMouseX = e.clientX;
			const factor = (typeof revertAttr !== typeof undefined) ? -1 : 1;
			const moveHandler = (e)=>{
				target.width(initWith + (e.clientX - initMouseX) * factor);
				e.stopPropagation();
			};
			const mouseupHandler = (e) => {
				$(document).off('mousemove', moveHandler);
				$(document).off('mouseup', mouseupHandler);
				e.stopPropagation();
			};
			$(document).on('mousemove', moveHandler);
			$(document).on("mouseup", mouseupHandler)

		})

		let lastTimeOut: any;
		editorCodeMirror.on('change', ()=>{
			if(lastTimeOut != null) clearTimeout(lastTimeOut);
			lastTimeOut = setTimeout(()=>{
				if(editorCodeMirror.getValue() !== currentDecoder[currentDecoder.type]){
					currentDecoder[currentDecoder.type] = editorCodeMirror.getValue();
					saveDecoder(currentDecoder);
					if(currentDecoder.type==='js'){
						doTest();
					}
				}
			}, 500);
		})

		selectDecoderFromAnvhor();
		window.addEventListener('hashchange', () => selectDecoderFromAnvhor());
		renderResult();
	}

	function getAnchor(): string {
		return window.location.hash.substr(1);
	}

	function selectDecoderFromAnvhor(): void {
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
