var roc = require('roc')

var server = new roc.server({
	port: 3000, // process.env.PORT restera prioritaire dans tous les cas
	logger: true, // important, vous ne verrez pas les erreurs si désactivé
	path: './public', // chemin contenant vos pages web

	interceptRequests: true, // vous ne pourrez pas répondre manuellement aux requêtes si désactivé. Si activé, vous *devrez* répondre manuellement aux requêtes

	liveReloadEnabled: true, // sera désactivé si process.env.NODE_ENV = 'production'
	useTailwindCSS: true,
	minifyHtml: true, // les pages HTML et les fichiers JavaScript seront minifiés, Tailwind CSS sera minifié et inclut dans la page, les autres fichiers ne seront pas impactés
})

server.on('ready', () => { console.log('received msg ready!') })
server.on('request', (req, res) => { // uniquement si interceptRequests est à true
	if(res.initialAction.type == 'sendHtml') res.send(200, res.initialAction.content.replaceAll('ROC', 'ROC Dynamic')) // TODO (user): à remplacer, c'est un simple exemple
	if(res.initialAction.type == 'sendJs') res.send(200, res.initialAction.content, { headers: { 'Content-Type': 'application/javascript' } })
	if(res.initialAction.type == 'sendFile') res.sendFile(200, res.initialAction.content)
	if(res.initialAction.type == 'redirect') res.redirect(302, res.initialAction.content)
	if(res.initialAction.type == '404') res.send404()
})

server.start()