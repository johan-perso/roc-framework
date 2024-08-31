var roc = require('../../index.js') // TODO: mettre juste "roc"

var server = new roc.server({
	port: 3000, // process.env.PORT restera prioritaire dans tous les cas
	logger: true,
	interceptRequests: true, // requis pour écouter les requêtes
	liveReloadEnabled: true,
	useTailwindCSS: true,
	minifyHtml: true, // Tailwind CSS et JavaScript sont toujours minifiés
	path: './public',
	// ...
})

server.on('ready', () => {console.log('received msg ready!')})
server.on('error', (content) => {}) // on va ptet ignorer les erreurs : throw les importantes, log (si activé) les moins importantes
server.on('request', (req, res) => { // si interceptRequests est à true
	// permet de retourner une valeur différence que celle que roc allait envoyer par lui-même
	// on renvoie rien si cette fonction n'est pas répondue puisqu'on attendra pour tjr
})

server.start()