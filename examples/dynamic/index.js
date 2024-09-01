var roc = require('../../index.js') // TODO: mettre juste "roc"

var server = new roc.server({
	port: 3000, // process.env.PORT restera prioritaire dans tous les cas
	logger: true,
	interceptRequests: true, // requis pour écouter les requêtes et retourner des valeurs différentes
	liveReloadEnabled: true,
	useTailwindCSS: true,
	minifyHtml: true, // Tailwind CSS et JavaScript sont toujours minifiés
	path: './public',
})

server.on('ready', () => { console.log('received msg ready!') })
server.on('error', (content) => {}) // on va ptet ignorer les erreurs : throw les importantes, log (si activé) les moins importantes
server.on('request', (req, res) => { // uniquement si interceptRequests est à true
	if(req.path == '/'){
		res.send(200, res.initialAction.content.replaceAll('ROC', 'ROC Dynamic'))
	} else {
		res.send(404, 'Not found')
	}
})

server.start()