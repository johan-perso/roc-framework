var roc = require('../../index.js') // TODO: mettre juste "roc", et indiquer dans le readme de télécharger directement ce dossier comme starter

var server = new roc.server({
	port: 3000, // process.env.PORT restera prioritaire dans tous les cas
	logger: true,
	interceptRequests: true, // requis pour écouter les requêtes et retourner des valeurs différentes
	liveReloadEnabled: true,
	useTailwindCSS: true,
	minifyHtml: true, // Tailwind CSS sera minifié dans la page, les fichiers JavaScript seront aussi minifiés, les autres fichiers ne seront pas impactés
	path: './public',
})

server.on('ready', () => { console.log('received msg ready!') })
server.on('request', (req, res) => { // uniquement si interceptRequests est à true
	// Page d'accueil : servir la page initiale en remplacant "ROC" par "ROC Dynamic"
	if(req.path == '/'){
		res.send(200, res.initialAction.content.replaceAll('ROC', 'ROC Dynamic'))
	}

	// Test.js : retourner un simple fichier JavaScript
	else if(req.path == '/test.js'){
		if(res.initialAction.type == 'sendJs') res.send(200, res.initialAction.content, { headers: { 'Content-Type': 'application/javascript' } })
		else res.sendFile(200, res.initialAction.content)
	}

	// Pour les autres routes déclarés mais qu'on ne veut pas gérer
	else {
		res.send(404, 'Not found')
	}
})

server.start()