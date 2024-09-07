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
	if(res.initialAction.type == 'sendHtml') res.send(200, res.initialAction.content.replaceAll('ROC', 'ROC Dynamic'))
	if(res.initialAction.type == 'sendJs') res.send(200, res.initialAction.content, { headers: { 'Content-Type': 'application/javascript' } })
	if(res.initialAction.type == 'sendFile') res.sendFile(200, res.initialAction.content)
	if(res.initialAction.type == 'redirect') res.redirect(302, res.initialAction.content)
	if(res.initialAction.type == '404') res.send404()
})

server.start()