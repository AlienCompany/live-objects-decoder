declare const Swal: any;

interface Decoder {
	type: 'ts' | 'js';
	fileName: string;
	navHtmlElement?: HTMLElement;
}

interface DecoderSource {
	js: string;
	ts?: string;
}

$(() => {
	let decoders: Decoder[];
	let currentDecoder: Decoder;
	const noop = () => undefined;

	const defaultJsDecoderContent = ``;
	const defaultTsDecoderContent = ``;

	async function deleteDecoder(decoder: Decoder): Promise<void> {

		const fileName = decoder.fileName + '.' + decoder.type;

		await $.ajax({method: 'DELETE', url: `/src/decoders/${fileName}`});

		$(decoder.navHtmlElement).remove();
		decoders.splice(decoders.indexOf(decoder),1);
	}

	async function renameDecoder(decoder: Decoder, newName: string): Promise<void> {

		const fileName = decoder.fileName + '.' + decoder.type;
		const newFileName = newName + '.' + decoder.type;

		await $.ajax({method: 'PATCH', url: `/src/decoders/rename/${fileName}/${newFileName}`});

		decoder.fileName = newName;
		$(decoder.navHtmlElement).find('.fileName').text(newName);
	}

	async function copyDecoder(decoder: Decoder, newName: string) {

		const fileName = decoder.fileName + '.' + decoder.type;
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

	async function getSource(decoder: Decoder): Promise<string> {
		return $.get(`/src/decoders/${decoder.fileName}.${decoder.type}`)
	}

	function selectDecoder(decoder: Decoder): void {
		if (currentDecoder) {
			$(currentDecoder.navHtmlElement).removeClass('active')
		}
		$(decoder.navHtmlElement).addClass('active');
		currentDecoder = decoder;
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

	async function init() {
		const decodersFileName: string[] = await $.get('decoders');
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
		$('#decoders form select').on('change', (e) => newDecoder());

		selectDecoderFromAnvhor();
		window.addEventListener('hashchange', ()=>selectDecoderFromAnvhor());
	}

	function getAnchor(): string{
		return window.location.hash.substr(1);
	}

	function selectDecoderFromAnvhor(): void{
		const anchor = getAnchor();
		const anchorDecoder = decoders.find((d)=>d.fileName === anchor) || decoders[0];
		if(anchorDecoder !== currentDecoder){
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
