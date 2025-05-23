#!/usr/bin/env node
/* eslint-disable default-param-last */

// Importer les modules
const fs = require("fs")
const path = require("path")
const sqwish = require("sqwish")
const htmlMinify = require("html-minifier").minify
const chalk = require("chalk")
const { consola } = require("consola")
const compression = require("compression")
const cheerio = require("cheerio")
const childProcess = require("child_process")
const rocPkg = require("./package.json")
require("dotenv").config()
var QRCode

var Terser
var minifiedFiles = {}
var components = []

var lastCommitHash = null
var projectPkg = null
var projectPath = path.join(process.cwd(), "public")

var globalLiveReloadEnabled = false

var _dynamicEmitter
var _events = {
	ready: [],
	request: []
}

// Si on exécute depuis le CLI
var fromCli = require.main === module
if(fromCli && process.isTTY) process.stdin.setRawMode(false) // j'sais même pas comment mais ça règle v'là les problèmes avec les raccourcis clavier (genre CTRL+C qui quitte le programme nativement)
if(!fromCli) consola.level = -999
var isDev = (fromCli && process.argv.slice(2)[0] == "dev") || (!fromCli && process.env.NODE_ENV != "production") == true

// (CLI) Exécuter certaines fonctions selon les arguments
if(fromCli){
	if(process.argv.slice(2).length == 0) return consola.error("Aucune commande spécifiée. Liste des commandes disponibles : version, dev, build, start")
	else if(process.argv.slice(2)[0] == "version") return console.log(rocPkg?.version || "Inconnu") // afficher la version

	var varResponse = initVariables()
	if(varResponse != true) throw new Error(varResponse)

	if(process.argv.slice(2)[0] == "dev") startServer() // serveur de développement
	else if(process.argv.slice(2)[0] == "build") buildRoutes() // build les fichiers
	else if(process.argv.slice(2)[0] == "start"){
		if(process.argv.slice(2).includes("--no-build")){ // démarrer le serveur statique sans build à cause de l'argument --no-build
			consola.warn("Utilisation de l'argument --no-build, le serveur statique va démarrer sans build.")
			return startStaticServer()
		}
		else buildRoutes().then(result => result == true ? startStaticServer() : process.exit(1)) // build les fichiers puis démarrer le serveur statique
	}
	else consola.error("Commande inconnue. Liste des commandes disponibles : version, dev, build, start")
}

// Fonction pour échapper du HTML // pouvant être utile pour les sites qui ont du code traité par le serveur
function escapeHtml(unsafe){ // eslint-disable-line
	return unsafe.toString().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;")
}

// Obtenir le code HTML d'un composant
function getHtmlComponent(componentPath){
	componentPath = componentPath.toLowerCase().trim()

	var componentsList = walk(path.join(projectPath, "components"))
	var component
	componentsList.forEach(inList => {
		var simplifiedInList = inList.toLowerCase().trim() // pour supporter les systèmes sensibles à la casse
		if(simplifiedInList.endsWith(".html") && simplifiedInList.endsWith(`${componentPath}.html`) && path.basename(simplifiedInList) == path.basename(`${componentPath}.html`)){
			component = inList
		}
	})

	if(!component) return null

	var componentContent = fs.readFileSync(component, "utf8")
	return componentContent
}

// Fonction pour exécuter du code côté serveur depuis une page
function execEmbeddedCode(html, routeFile, context){
	if(!config.serversideCodeExecution){
		consola.warn(`L'exécution de code côté serveur pour le fichier ${routeFile} n'a pas fonctionné puisque cette fonctionnalité est désactivé dans la configuration.`)
		return html
	}

	try {
		html = html.replace(/\{\{\s*((?:(?!\$).)*?)\s*\}\}/g, (match, p1) => {
			return function(){ return eval(p1) }.call(context)
		})
	} catch (err) {
		consola.warn(`Erreur lors de l'évaluation du code dans le fichier ${routeFile}`, err)
	}

	return html
}

// Fonction pour récupérer l'hash du dernier commit d'un dépôt Git
function getLastCommitHash(cwd){
	if(!fs.existsSync(path.join(cwd, ".git"))) return null

	var hash

	try {
		hash = childProcess.execSync("git rev-parse --short HEAD", { cwd }).toString().trim()
	} catch (err) {
		consola.warn("Impossible de récupérer le hash du dernier commit Git via la méthode n°1, on essaye la deuxième méthode.")
	}

	if(!hash) try { // Fallback: on essaye de lire depuis le dossier .git directement
		const headPath = path.join(cwd, ".git", "HEAD")
		const headContent = fs.readFileSync(headPath, "utf8").trim()
		console.log(headContent)
		if(headContent.startsWith("ref:")){
			const refPath = headContent.split(" ")[1]
			const fullRefPath = path.join(cwd, ".git", refPath)
			hash = fs.readFileSync(fullRefPath, "utf8").trim().slice(0, 8) // hash raccourci
		} else hash = headContent.slice(0, 8)
	} catch (err) {
		consola.warn("Impossible de récupérer le hash du dernier commit Git via la méthode n°2, la version du site ne sera pas disponible au client.")
		return null
	}

	if(hash && hash.length) return hash
	else return null
}

// Fonction pour afficher un QR code dans le terminal
function showQRCode(content){
	if(!QRCode) QRCode = require("qrcode")

	QRCode.toString(content, { type: "terminal" }, (err, url) => {
		if(err) return consola.box(err?.stack || err?.message || err)
		else consola.box(url)
	})

	return true
}

// Initialisation de certaines variables
var config
function initVariables(configParam = null){ // configParam doit être présent si on est sur un projet dynamique
	var errorsReturned = ""

	// Obtenir le package.json du projet actuel
	if(!fromCli) try {
		projectPkg = require(path.join(projectPath, "..", "package.json"))
	} catch (err) {
		consola.warn("Le fichier package.json de votre projet n'a pas pu être lu. La version du site ne sera pas retournée dans les métadonnées.")
	}

	// Lire le fichier de configuration
	try {
		if(fromCli) var _config = require(path.join(projectPath, "..", "roc.config.js"))
		else if(!fromCli && configParam) var _config = configParam
		else if(!fromCli && !configParam) errorsReturned += "Roc a été initialisé sans configuration, le démarrage est impossible."

		config = _config
	} catch (err) {
		consola.error(new Error("Impossible de lire le fichier de configuration 'roc.config.js'. Vous avez peut-être mal initialisé le projet dans ce dossier ?"))
		console.error(err)
		errorsReturned += `Impossible de ${fromCli ? "lire le fichier de configuration 'roc.config.js'" : "déterminer la configuration de Roc"}. Vous avez peut-être mal initialisé le projet ${fromCli ? "dans ce dossier " : ""}?`
	}

	// Si on utilise pas Tailwind CSS, on recommande de supprimer le fichier de config
	if(config && !config.useTailwindCSS && fs.existsSync(path.join(projectPath, "..", "tailwind.config.js"))) consola.warn("Vous avez désactivé l'utilisation de Tailwind CSS, vous pouvez supprimer le fichier \"tailwind.config.js\"")

	lastCommitHash = getLastCommitHash(path.join(projectPath, ".."))

	// Si on a des erreurs, on les retourne
	if(errorsReturned) return errorsReturned
	else return true
}

// Obtenir son IP local
async function getLocalIP(){
	var ip = require("os").networkInterfaces()["Wi-Fi"]?.filter(i => i?.family == "IPv4")[0] || Object.values(require("os").networkInterfaces()).flat().filter(({ family, internal }) => family === "IPv4" && !internal).map(({ address }) => address)[0] || await require("dns").promises.lookup(require("os").hostname())
	return ip.address || ip || "<votre ip local>"
}

// Fonction pour retourner une erreur si un des deux paramètres est mal rangé
function checkCodeAndContentOrder(res, code, content){
	if(!code || !content){
		res.send("[dev error] Un paramètres est manquant dans la fonction appelée pour répondre à cette requête")
		return false
	}
	if(code && typeof code != "number"){
		res.send("[dev error] Le code de statut HTTP doit être un nombre")
		return false
	}
	if(content && (typeof content == "undefined" || typeof content == "function")){
		res.send("[dev error] Le contenu ne doit pas être manquant ni ne doit être une fonction")
		return false
	}
	return true
}

// Obtenir les fichiers/dossiers dans un dossier
function walk(dir){
	var results = []
	var list = fs.readdirSync(dir)
	if(!list) return results
	for(var i = 0; i < list.length; i++){
		var file = path.join(dir, list[i])
		var stat = fs.statSync(file)
		if(!stat) continue
		var isDirectory = stat && stat.isDirectory()
		if(isDirectory) results = results.concat(walk(file))
		else results.push(file)
	}
	return results
}

// Obtenir la liste des routes
var routes = []
function getRoutes(){
	routes = []
	components = []
	walk(path.join(projectPath)).forEach(file => {
		// Ajouter les composants, et exposer uniquement en fonction de config.exposeComponents
		if(path.relative(projectPath, file).startsWith("components/")){
			var loweredCaseName = path.relative(projectPath, file).toLowerCase().trim()
			if(loweredCaseName.startsWith("components/")) loweredCaseName = loweredCaseName.replace("components/", "")
			if(loweredCaseName.endsWith(".html")) loweredCaseName = loweredCaseName.slice(0, -5)
			components.push(loweredCaseName)
			if(!config.exposeComponents) return
		}

		// Ne pas ajouter certaines routes
		if(path.relative(path.join(projectPath), file) == "_routing.json") return // fichier de routing
		if(path.relative(path.join(projectPath), file) == "404.html") return // page d'erreur 404
		if(path.basename(file) == ".DS_Store") return // fichiers .DS_Store

		// Ajouter la route
		if(file.endsWith(".html")) routes.push({ path: `/${path.relative(path.join(projectPath), file) == "index.html" ? "" : path.relative(path.join(projectPath), file).replace(/\\/g, "/")}`, file: file })
		else routes.push({ path: `/${path.relative(path.join(projectPath), file).replace(/\\/g, "/")}`, file: file })
	})
	return routes
}

// Générer le Tailwind CSS
var postcss = require("postcss")
var tailwind = require("tailwindcss")
var tailwindCSS
var minifiedTailwindCSS
async function generateTailwindCSS(){
	try {
		// Vérifier la configuration
		var twConfig = require(path.join(projectPath, "..", "tailwind.config.js"))
		if(twConfig?.daisyui?.logs != false) return consola.warn("Il est recommendé de désactiver les logs de DaisyUI dans le fichier de configuration Tailwind CSS: daisyui: { logs: false }")

		// Obtenir le CSS supplémentaire (style.css et styles.css)
		var extraCSS = ""
		if(fs.existsSync(path.join(projectPath, "style.css"))) extraCSS += fs.readFileSync(path.join(projectPath, "style.css"), "utf8")
		if(fs.existsSync(path.join(projectPath, "styles.css"))) extraCSS += fs.readFileSync(path.join(projectPath, "style.css"), "utf8")

		// Générer et retourner le CSS
		if(!postcss) postcss = require("postcss")
		if(!tailwind) tailwind = require("tailwindcss")
		const result = await postcss([
			tailwind({ config: path.join(projectPath, "..", "tailwind.config.js") }),
		]).process(`@tailwind base;@tailwind components;@tailwind utilities;${extraCSS}`, { from: undefined })
		tailwindCSS = result.css
	} catch (err) {
		consola.warn("Tailwind CSS n'a pas pu être généré", err)
	}

	try {
		if(tailwindCSS && tailwindCSS?.length) minifiedTailwindCSS = sqwish.minify(tailwindCSS)
	} catch (err) {
		consola.warn("Tailwind CSS semble avoir été généré, mais n'a pas pu être minifié", err)
	}

	return tailwindCSS
}

// Générer le code HTML d'une page
function generateHTML(routeFile, routePath, devServPort, options = { disableTailwind: false, disableLiveReload: false, preventMinify: false, forceMinify: false }){
	// Lire le fichier HTML
	var html
	try {
		html = fs.readFileSync(path.join(routeFile), "utf8")
	} catch (err) {
		html = "_404"
	}
	if(html == "_404") return `404: le fichier "${routeFile}" n'existe pas.`

	// Forcer la minification si on est sur serv dynamique et que l'option est activé dans la config
	if(!fromCli && config.minifyHtml) options.forceMinify = true

	// Exécuter du code côté serveur depuis le fichier HTML
	html = execEmbeddedCode(html, routeFile, {
		routeFile,
		routePath,
		isDev,
		escapeHtml,
		getHtmlComponent,
		options,
	})

	// Parser le DOM
	var dom = cheerio.load(html, { xml: { xmlMode: false, decodeEntities: false, lowerCaseAttributeNames: true } })
	var domHead = dom("head")
	var domBody = dom("body")
	const allElementsInDom = dom("*")

	// Détecter et gérer les composants custom
	for(var component of components){
		var usesInDom = Array.from(allElementsInDom.filter((i, el) => el.name.toLowerCase() == component))
		if(!usesInDom.length) continue // on utilise pas ce composant dans cette page

		usesInDom.forEach(el => {
			var componentName = el?.name || component
			var componentAttribs = el?.attribs
			var componentHtml = getHtmlComponent(componentName)

			if(!componentName || !componentHtml) return

			// Autoriser l'exécution de code et l'utilisation d'attributs
			componentHtml = execEmbeddedCode(componentHtml, `${component}.html`, {
				routeFile,
				routePath,
				isDev,
				escapeHtml,
				getHtmlComponent,
				options,
				componentName,
				componentAttribs
			})
			componentHtml = componentHtml.replace(/\{\{\s*\$\s*([\s\S]*?)\s*\}\}/g, (match, p1) => {
				return componentAttribs[p1.toLowerCase().trim()] || `$${p1}`
			})

			// Ajouter le composant dans le DOM
			if(componentHtml) dom(el).replaceWith(componentHtml)
			else consola.warn(`Le composant "${componentName}" n'a pas pu être trouvé pour la route ${routeFile}`)
		})
	}

	// Ajouter un header "generator" dans le head
	if(domHead) var domHeadGenerator = domHead.find("meta[name='generator']")
	if(domHead && !domHeadGenerator.length) domHead.append(`<meta name="generator" content="ROC v${rocPkg?.version}">`)

	// Ajouter un objet avec des infos sur le site
	if(domHead) var domHeadSiteInfo = domHead.find("script#reserved-roc-siteinfos")
	if(domHead && !domHeadSiteInfo.length) domHead.append(`<script id="reserved-roc-siteinfos">window.roc = ${JSON.stringify({
		projectVersion: projectPkg?.version || undefined,
		rocVersion: rocPkg?.version || undefined,
		lastCommit: lastCommitHash || undefined,
		isDev: isDev ? true : undefined,
	})}</script>`)

	// Si on est en développement (CLI) ou option activé (dynamique), on va ajouter le live reload
	if(globalLiveReloadEnabled || (fromCli && process.argv.slice(2)[0] == "dev" && !options.disableLiveReload)){
		if(domHead) domHead.append(`<script>url=new URL('ws://'+location.host),url.port=${devServPort + 1};new WebSocket(url).onmessage=(e)=>{if(e.data=='re')location.reload()}</script>`)
		else if(domBody) domBody.append(`<script>url=new URL('ws://'+location.host),url.port=${devServPort + 1};new WebSocket(url).onmessage=(e)=>{if(e.data=='re')location.reload()}</script>`)
	}

	// Si on utilise Tailwind CSS, on va minifier le CSS et l'insérer dans l'HTML
	if(config.useTailwindCSS && !options.disableTailwind && tailwindCSS){
		if(!minifiedTailwindCSS) minifiedTailwindCSS = sqwish.minify(tailwindCSS) // normalement il l'est déjà, puisque minifié pendant sa génération
		if(domHead) domHead.append(`<style>${minifiedTailwindCSS}</style>`)
		else if(domBody) domBody.append(`<style>${minifiedTailwindCSS}</style>`)
	}

	// Transformer le DOM en HTML
	html = dom.html({ xml: { xmlMode: false, decodeEntities: false, lowerCaseAttributeNames: true } })

	// On retourne le code HTML
	try {
		return ((config.minifyHtml && !options.preventMinify) || options.forceMinify) ? htmlMinify(html, { useShortDoctype: true, removeStyleLinkTypeAttributes: true, removeScriptTypeAttributes: true, removeComments: true, minifyURLs: true, minifyJS: true, minifyCSS: true, caseSensitive: true, preserveLineBreaks: true, collapseWhitespace: true, continueOnParseError: true }) : html
	} catch (err) {
		consola.warn(err?.error || err?.message || err?.toString() || err)
		return html // on envoie le HTML non minifié si on a une erreur
	}
}

// Démarrer le serveur de développement
var server
var app
var serverRestart = 0
var wss
var routesCount
async function startServer(port = parseInt(process.env.PORT || config.devPort || 3000)){
	// Si on a déjà un serveur, on le ferme
	if(server) server.close()

	// Si on utilise Tailwind CSS
	if(config.useTailwindCSS){
		// On vérifie si la config de Tailwind CSS existe
		if(!fs.existsSync(path.join(projectPath, "..", "tailwind.config.js"))){
			fs.writeFileSync(path.join(projectPath, "..", "tailwind.config.js"), "/** @type {import('tailwindcss').Config} */\nmodule.exports = {\n\tcontent: ['./public/**/*.{html,js}', './index.js'],\n\tplugins: [require('daisyui')],\n\tdaisyui: {\n\t\tlogs: false,\n\t\tthemes: [\n\t\t\t\"dark\"\n\t\t],\n\t}\n}")
			consola.success("Fichier de configuration Tailwind CSS créé")
		}

		// On génère le CSS
		await generateTailwindCSS()
	}

	// Importer le serveur
	const express = require("express")
	app = express()
	app.use(express.json({ limit: "10mb" }))
	app.use(express.urlencoded({ extended: true, limit: "10mb" }))
	app.disable("x-powered-by")
	if(!isDev) app.use(compression())
	await new Promise((resolve, reject) => {
		server = null
		server = app.listen(port, async () => {
			// Si c'est le tout premier démarrage et qu'on est en mode dev, on va préparer le live reload
			if(!serverRestart && (globalLiveReloadEnabled || (fromCli && process.argv.slice(2)[0] == "dev"))){
				const WebSocket = require("ws")
				wss = new WebSocket.Server({ port: port + 1 })
			}

			// Afficher les boxes dans la console
			consola.box(`${chalk.bgBlueBright(" ROC ")} Serveur ${fromCli ? "de développement" : "dynamique"} démarré\n\n ${chalk.dim("┃")} ${chalk.bold("Environnement")}    ${isDev ? "Développement" : "Production"}\n ${chalk.dim("┃")} ${chalk.bold("Commit")}           ${lastCommitHash || "Inconnu"}\n\n ${chalk.dim("┃")} ${chalk.bold("Local")}            ${chalk.blueBright(`http://127.0.0.1:${port}`)}\n ${chalk.dim("┃")} ${chalk.bold("Réseau")}           ${chalk.blueBright(`http://${await getLocalIP()}:${port}`)}${global.tunnelLink ? `\n ${chalk.dim("┃")} ${chalk.bold("Externe")}    ${chalk.blueBright(global.tunnelLink)}` : ""}`),
			fromCli && process.stdin.isTTY ? consola.box(`${chalk.bgBlueBright(" ROC ")} Raccourcis disponibles :\n\n ${chalk.dim("━")} ${chalk.bold("r")}         ${chalk.blueBright("Redémarre le serveur en relancant les analyses")}\n ${chalk.dim("━")} ${chalk.bold("q")}         ${chalk.blueBright("Ferme le serveur puis quitte le processus")}\n ${chalk.dim("━")} ${chalk.bold("c")}         ${chalk.blueBright("Affiche un QR Code pour accéder au serveur")}\n ${chalk.dim("━")} ${chalk.bold("t")}         ${chalk.blueBright("Ouvre un tunnel accessible hors du réseau")}\n ${chalk.dim("━")} ${chalk.bold("CTRL+L")}    ${chalk.blueBright("Vide le contenu de la console")}`) : `\n${chalk.yellow("⚠")} Les raccourcis clavier ne sont pas disponibles dans cet environnement.\n`

			// Si on a déjà démarré le serveur, on va juste redémarrer
			serverRestart++
			resolve()
		})

		// En cas d'erreur
		server.on("error", (err) => {
			// Si c'est car le port est déjà utilisé
			if(err.code == "EADDRINUSE" || err.code == "EACCES") return startServer(port + 10)
			else { // sinon on affiche juste l'erreur
				if(consola.level < 0) console.log(`[ROC ERROR] Une erreur s'est produit au démarrage du serveur alors que le logger intégré était désactivé : ${err?.message || err?.toString() || err}`)
				else consola.error(err?.message || err?.toString() || err)
			}
		})
	})

	// Si on avait pas encore le serveur, on le démarre et on fait quelques autres étapes
	if(serverRestart == 1){
		// Raccourcis clavier
		if(process.stdin.isTTY && fromCli){
			process.stdin.setRawMode(true)
			process.stdin.resume()
			process.stdin.setEncoding("utf8")
			process.stdin.on("data", async (key) => {
				if(key == "r") return startServer(port) // relance le serveur
				if(key == "\r") return consola.log() // sauter une ligne (ENTER)
				else if(key == "\u000c") return console.clear() // clear
				else if(key == "q" || key == "\u0003") process.exit() // quitter
				else if(key == "c") showQRCode(global.tunnelLink || `http://${await getLocalIP()}:${port}`) // afficher un QR code
				else if(key == "t" && !global.tunnelLink){ // ouvrir un tunnel
					consola.info("Ouverture du tunnel...")
					var localtunnel = require("localtunnel")
					var tunnel = await localtunnel({ port: port })
					global.tunnelLink = tunnel.url
					consola.success(`Tunnel ouvert : ${global.tunnelLink || tunnel?.url}`)

					if(global.fetch){
						var externIP = await fetch("https://api.ipify.org?format=json").then(res => res.json())
						if(!externIP?.ip) return
						global.externIP = externIP.ip
						consola.info(`Adresse IP externe : ${externIP.ip}`)
					}
				}
				else if(key == "t" && global.tunnelLink) consola.success(`Tunnel déjà ouvert : ${global.tunnelLink} (IP externe : ${global.externIP})`) // afficher un tunnel déjà ouvert
			})
		}

		// Si on veut ouvrir le navigateur
		if(config.devOpenBrowser && fromCli) require("open")(`http://127.0.0.1:${server.address().port}`, { app: { name: process.env.ROC_DEFAULT_BROWSER || undefined } })

		// Quand on modifie un fichier
		if(isDev){
			const chokidar = require("chokidar")
			chokidar.watch([
				path.join(projectPath),
				path.join(projectPath, "..", "roc.config.js"),
				path.join(projectPath, "..", "tailwind.config.js")
			], { ignoreInitial: true, ignorePermissionErrors: true }).on("all", async (event, fileChangedPath) => {
				// Log
				if(fromCli && fileChangedPath.endsWith("roc.config.js")) consola.warn("Le fichier de configuration roc.config.js a été modifié, redémarrez l'ensemble du processus pour appliquer les changements")

				// Si on utilise TailwindCSS et qu'on a modifié un fichier HTML/CSS/JS
				if(config.useTailwindCSS && (fileChangedPath.endsWith(".html") || fileChangedPath.endsWith(".css") || fileChangedPath.endsWith(".js"))) await generateTailwindCSS()

				// Live reload
				if(event == "change" && wss?.clients) wss.clients.forEach(client => client.send("re"))

				// Si on a un changement du nombre de routes, ou une modification dans le routing, on redémarre le serveur
				if(fileChangedPath.endsWith("_routing.json") || routesCount != getRoutes().length){
					routesCount = routes.length
					return startServer(port) // on redémarre le serveur (mais certaines étapes ne seront pas refaites)
				}
			})
		}
	}

	// On récupère la liste des routes
	if(serverRestart == 1) routesCount = getRoutes().length

	// Si le fichier de routing existe
	if(fs.existsSync(path.join(projectPath, "_routing.json"))){
		// On lit le fichier
		var routing
		try {
			routing = JSON.parse(fs.readFileSync(path.join(projectPath, "_routing.json"), "utf8"))
			routing = Object.entries(routing)
		} catch (err) {
			consola.warn("Erreur lors de la lecture du fichier de routing", err)
		}

		// On les ajoute si on en a
		if(routing) routing.forEach(([route, file]) => {
			// Ajouter un slash au début de la route
			if(!route.startsWith("/")) route = `/${route}`

			// On ajoute la route
			if(file.options?.showFile){
				routes = routes.filter(r => r.path != (route || route.path)) // supprimer l'ancienne
				routes.push({ path: route, method: file.method, file: path.join(projectPath, "..", file.options.showFile), options: file.options }) // ajouter la nouvelle
			}
			else if(!file.options && file.method && routes.find(r => r.path == route.path)) routes.filter(r => r.path == route.path)[0].method = file.method // modifier l'ancienne
			else if(file.options){
				routes = routes.filter(r => r.path != (route || route.path)) // supprimer l'ancienne
				routes.push({ path: route, method: file.method || "GET", options: file.options }) // ajouter la nouvelle
			} else if(!fromCli){ // permettre de déclarer des routes sans fichier (dynamique)
				routes.push({ path: route, method: file.method || "GET", options: file.options })
			}
		})
	}

	// Log les routes
	var minimalRoutes = routes.slice(0, 7)
	if(fromCli) consola.info(`${routes.length} route${routes.length > 1 ? "s" : ""} ajoutée${routes.length > 1 ? "s" : ""} :\n  • ${minimalRoutes.map(r => r.path).join("\n  • ")}${routes.length > minimalRoutes.length ? `\n  • ... et ${routes.length - minimalRoutes.length} autres` : ""}`)

	// Log chaque requête
	app.use((req, res, next) => {
		consola.log(`${chalk.green(req.method)} ${req.url}`)
		next()
	})

	// Importer Terser
	if(!Terser) Terser = require("terser")

	// On ajoute les routes
	routes.forEach(route => {
		// Si la méthode n'est pas valide, on ne l'ajoute pas
		if(route.method && !require("http").METHODS.includes(route.method.toUpperCase())) return consola.warn(`La méthode ${route.method} n'est pas valide pour la route ${route.path}`)

		// Fonction pour ajouter la route
		var addedRoutes = []
		function addRoute(method, routePath){
			// Si c'est un fichier index.html dans un dossier, on utilise /
			if(routePath.endsWith("/index")) routePath = routePath.slice(0, -5)
			if(routePath.endsWith("/index.html")) routePath = routePath.slice(0, -10)

			if(addedRoutes.find(r => r.method == method && r.routePath == routePath)) return
			addedRoutes.push({ method, routePath })

			app[method](routePath, async (req, res) => {
				var actionType = ""
				var actionContent = ""

				// Si on a pas de "file", on vérifie si on doit pas faire une redirection
				if(!route.file && route.options?.redirect){
					actionType = "redirect"
					actionContent = route?.options?.redirect
					return
				}

				// Sinon, on envoie le fichier
				if(route.file){
					if(route.file.endsWith(".html")){
						if(!req.url.endsWith("/")) return res.redirect(`${req.url}/`) // Ajouter un slash à la fin de l'URL

						actionType = "sendHtml"
						actionContent = generateHTML(route.file, routePath, port, { disableTailwind: route?.options?.disableTailwind, disableLiveReload: route?.options?.disableLiveReload, preventMinify: route?.options?.preventMinify, forceMinify: route?.options?.forceMinify }) // Si c'est un fichier .html, on génère le code HTML
					} else if(route.file.endsWith(".js")){
						actionType = "sendJs"
						actionContent = fs.readFileSync(route.file, "utf8")

						if(!route.options?.preventMinify){
							if(minifiedFiles[route.file]) actionContent = minifiedFiles[route.file]
							else {
								try {
									actionContent = (await Terser.minify(actionContent))?.code || actionContent
									if(!isDev) minifiedFiles[route.file] = actionContent
								} catch (err) {
									consola.warn(`Erreur lors de la minification du fichier ${route?.file || route}`, err?.message || err?.toString() || err)
									actionContent = "Cannot minify file, check roc console"
								}
							}
						}
					} else {
						actionType = "sendFile"
						actionContent = route.file // Sinon on envoie le fichier
					}
				}

				// Si on a pas su quoi faire
				else {
					actionType = "404"
					actionContent = `404: la route "${route.path}" est mal configuré.`
				}

				// Si on est en mode dynamique et que l'interception des requêtes est activés
				if(!fromCli && config.interceptRequests){
					var customReq = {
						url: req.url,
						path: req.path,
						method: req.method,
						headers: req.headers,
						body: req.body,
						query: req.query,
						params: req.params,
						cookies: req.cookies,
						ip: req.ip,
						hostname: req.hostname,
						protocol: req.protocol,
						secure: req.secure,
						originalUrl: req.originalUrl,
					}

					var customRes = {
						send: (statusCode = 200, content, options = {}) => {
							if(checkCodeAndContentOrder(res, statusCode, content) != true) return
							if(options.headers) res.set(options.headers)
							res.status(statusCode).send(content)
						},
						sendFile: (statusCode = 200, content, options = {}) => {
							if(checkCodeAndContentOrder(res, statusCode, content) != true) return
							if(options.headers) res.set(options.headers)
							res.status(statusCode).sendFile(content)
						},
						json: (statusCode = 200, content, options = {}) => {
							if(checkCodeAndContentOrder(res, statusCode, content) != true) return
							if(options.headers) res.set(options.headers)
							res.status(statusCode).json(content)
						},
						redirect: (statusCode = 302, content, options = {}) => {
							if(checkCodeAndContentOrder(res, statusCode, content) != true) return
							if(options.headers) res.set(options.headers)
							res.redirect(statusCode, content)
						},
						send404: () => {
							if(fs.existsSync(path.join(projectPath, "404.html"))) res.status(404).send(generateHTML(path.join(projectPath, "404.html"), req.path, port))
							else res.status(404).send(`404: la page "${req.url}" n'existe pas.`)
						},
						initialAction: { type: actionType, content: actionContent },
					}

					try {
						_dynamicEmitter("request", customReq, customRes)
					} catch (err) {
						consola.error(err?.message || err?.toString() || err)
					}

				} else { // sinon, on effectue les actions de base (sans interception)
					if(actionType == "sendHtml") return res.send(actionContent)
					if(actionType == "sendJs") return res.header("Content-Type", "application/javascript").send(actionContent)
					if(actionType == "sendFile") return res.sendFile(actionContent)
					if(actionType == "redirect") return res.redirect(actionContent)
					if(actionType == "404"){
						if(fs.existsSync(path.join(projectPath, "404.html"))) return res.status(404).send(generateHTML(path.join(projectPath, "404.html"), req.path, port))
						return res.status(404).send(`404: la page "${req.url}" n'existe pas.`)
					}
				}
			})
		}

		// On ajoute la route
		addRoute(route.method?.toLowerCase() || "get", route.path)

		// On en ajoute une autre si elle finit par .html, pour permettre d'accéder à la page sans l'extension
		if(route.path.endsWith(".html")) addRoute(route.method?.toLowerCase() || "get", route.path.slice(0, -5))
	})

	// On ajoute la page 404
	app.use((req, res) => {
		if(fs.existsSync(path.join(projectPath, "404.html"))) return res.status(404).send(generateHTML(path.join(projectPath, "404.html"), req.path, port))
		res.status(404).send(`404: la page "${req.url}" n'existe pas.`)
	})
}

// Générer les routes pour utiliser le site statiquement
async function buildRoutes(){
	// Si le dossier de build n'existe pas, on le crée
	if(!fs.existsSync(path.join(projectPath, "..", config.buildDir))) fs.mkdirSync(path.join(projectPath, "..", config.buildDir))
	consola.info(`Dossier de build: ${path.join(projectPath, "..", config.buildDir)}`)

	// Si on a un fichier dans le dossier build, on supprime tout
	if(fs.readdirSync(path.join(projectPath, "..", config.buildDir)).length > 0){
		walk(path.join(projectPath, "..", config.buildDir)).forEach(file => {
			fs.unlinkSync(file)
		})
		consola.info("Fichiers du précédent build supprimés")
	}

	// Importer Terser
	if(!Terser) Terser = require("terser")

	// Générer Tailwind CSS
	if(config.useTailwindCSS){
		await generateTailwindCSS()
		consola.info("Code Tailwind CSS généré avec succès")
	}

	// On récupère la liste des routes
	// Note: cette fonction est volontairement différente de celle utilisée pour le serveur de développement : la page 404 est incluse par exemple
	var routes = []
	components = []
	walk(path.join(projectPath)).forEach(file => {
		// Ajouter les composants, et exposer uniquement en fonction de config.exposeComponents
		if(path.relative(projectPath, file).startsWith("components/")){
			var loweredCaseName = path.relative(projectPath, file).toLowerCase().trim()
			if(loweredCaseName.startsWith("components/")) loweredCaseName = loweredCaseName.replace("components/", "")
			if(loweredCaseName.endsWith(".html")) loweredCaseName = loweredCaseName.slice(0, -5)
			components.push(loweredCaseName)
			if(!config.exposeComponents) return
		}

		// Ne pas ajouter certains fichiers
		if(path.relative(projectPath, file) == "_routing.json") return // fichier de routing
		if(path.basename(file) == ".DS_Store") return // fichiers .DS_Store

		// Ajouter la route
		routes.push({ path: path.relative(projectPath, file).replace(/\\/g, "/"), file: file })
	})

	// Si le fichier de routing existe
	if(fs.existsSync(path.join(projectPath, "_routing.json"))){
		// On lit le fichier
		var routing
		try {
			routing = JSON.parse(fs.readFileSync(path.join(projectPath, "_routing.json"), "utf8"))
			routing = Object.entries(routing)
		} catch (err) {
			consola.warn("Erreur lors de la lecture du fichier de routing", err?.message || err?.toString() || err)
		}

		// On les ajoute si on en a
		if(routing) routing.forEach(([route, file]) => {
			// Supprimer l'ancienne route
			routes = routes.filter(r => r.path != (route || route.path))

			// Enlever le slash au début
			if(route.startsWith("/")) route = route.slice(1)

			// Si on a une méthode
			if(file.method) return consola.warn(`Route ${chalk.blue(route)} : vous ne pouvez pas utiliser de méthodes dans un site statique.`)

			// Et on en ajoute une nouvelle
			if(file.options?.showFile) routes.push({ path: route, file: path.join(projectPath, "..", file.options.showFile), options: file.options })
			else if(file.options) routes.push({ path: route, options: file.options })
		})
	}

	// Log les routes
	var minimalRoutes = routes.slice(0, 7)
	consola.info(`${routes.length} route${routes.length > 1 ? "s" : ""} ajoutée${routes.length > 1 ? "s" : ""} :\n  • ${minimalRoutes.map(r => r.path).join("\n  • ")}${routes.length > minimalRoutes.length ? `\n  • ... et ${routes.length - minimalRoutes.length} autres` : ""}`)

	// On finit par générer les fichiers
	var generateFilePromise = new Promise((resolve, reject) => {
		routes.forEach(async route => {
			// Si on doit générer une redirection
			if(!route.file && route.options?.redirect) var content = `<!DOCTYPE html><html><head><title>Redirecting</title><meta http-equiv="refresh" content="0; url=${encodeURI(route.options.redirect.replace(/"/g, "\\\""))}"><script>location.href="${encodeURI(route.options.redirect.replace(/"/g, "\\\""))}"</script></head><body><a href="${encodeURI(route.options.redirect.replace(/"/g, "\\\""))}">Click here to force redirection</a></body></html>`

			// Si on a un fichier HTML
			else if(route.file && route.file.endsWith(".html")) var content = generateHTML(route.file, route.path, 0, { disableTailwind: route?.options?.disableTailwind, preventMinify: route?.options?.preventMinify, forceMinify: route?.options?.forceMinify })

			// Si on a pas su quoi faire
			else if(!route.file) return consola.warn(`Route : ${chalk.blue(route.path)} est mal configuré, vérifier le fichier de routage ou le dossier "public".`)

			// Afficher des avertissements dans certaines situations
			if(content){
				// Vérifier l'attribut "lang=" sur la balise <html> des fichiers .html
				if(route?.file?.endsWith(".html") && content && content.includes("<html")){
					var htmlTagLine = content.split("\n").filter(l => l.includes("<html"))[0]
					if(htmlTagLine && !htmlTagLine.includes("lang=\"")) consola.warn(`Le fichier ${chalk.blue(route.file)} ne contient pas d'attribut "lang=" sur la balise <html>`)
				}

				// Vérifier certaines métadonnées
				if(route?.file?.endsWith(".html") && content && content.includes("<html")){
					if(!content.includes("<meta name=\"viewport\"")) consola.warn(`Le fichier ${chalk.blue(route.file)} ne contient pas de balise <meta name="viewport">`)
					if(!content.includes("<meta name=\"title\"")) consola.warn(`Le fichier ${chalk.blue(route.file)} ne contient pas de balise <meta name="title">`)
					if(!content.includes("<meta name=\"description\"")) consola.warn(`Le fichier ${chalk.blue(route.file)} ne contient pas de balise <meta name="description">`)
					if(!content.includes("<meta property=\"og:title\"")) consola.warn(`Le fichier ${chalk.blue(route.file)} ne contient pas de balise <meta property="og:title">`)
					if(!content.includes("<meta property=\"og:description\"")) consola.warn(`Le fichier ${chalk.blue(route.file)} ne contient pas de balise <meta property="og:description">`)
					if(!content.includes("<meta charset=")) consola.warn(`Le fichier ${chalk.blue(route.file)} ne contient pas de balise <meta charset>`)
				}
			}

			// On écrit le fichier HTML
			if(content){
				const finalFilePath = path.join(projectPath, "..", config.buildDir, route.path)
				// Créer les dossiers si besoin
				if(route.path.includes("/") && !fs.existsSync(path.join(projectPath, "..", config.buildDir, route.path.split("/").slice(0, -1).join("/")))){
					fs.mkdirSync(path.join(projectPath, "..", config.buildDir, route.path.split("/").slice(0, -1).join("/")), { recursive: true })
				}

				fs.writeFileSync(finalFilePath, content.toString())
			}

			// Si on a pas de contenu, c'est car c'est pas un fichier HTML, donc on copie le fichier
			else {
				// Si on doit créer des dossiers
				if(route.path.includes("/") && !fs.existsSync(path.join(projectPath, "..", config.buildDir, route.path.split("/").slice(0, -1).join("/")))){
					fs.mkdirSync(path.join(projectPath, "..", config.buildDir, route.path.split("/").slice(0, -1).join("/")), { recursive: true })
				}

				// Si c'est un fichier JS et qu'on veut le minifier
				if(route.file.endsWith(".js")){
					// On va minifier le fichier
					var minifiedJs
					try {
						minifiedJs = await Terser.minify(fs.readFileSync(route.file, "utf8"))
					} catch (err) {
						consola.warn(`Erreur lors de la minification du fichier ${route?.file || route}`)
						throw (err?.message || err?.toString() || err)
					}

					// Écrire le fichier
					fs.writeFileSync(path.join(projectPath, "..", config.buildDir, route.path), minifiedJs.code)
				}

				// Sinon on va juste copier le fichier
				else fs.copyFileSync(route.file, path.join(projectPath, "..", config.buildDir, route.path))
			}

			// Si c'était le dernier fichier
			if(routes.indexOf(route) == routes.length - 1) resolve()
		})
	})
	await generateFilePromise
	consola.info("Fichiers générés dans le dossier de build")

	// Rajouter un fichier .nojekyll pour GitHub Pages
	fs.writeFileSync(path.join(projectPath, "..", config.buildDir, ".nojekyll"), "")

	// On finit
	consola.success("Build terminé !")
	return true
}

// Démarrer le serveur statique
var staticServer
async function startStaticServer(port = parseInt(process.env.PORT || config.devPort || 3000)){
	// Si on a déjà un serveur, on le ferme
	if(staticServer) staticServer.close()

	const buildDir = path.join(projectPath, "..", config.buildDir)
	const mime = require("mime")

	// Importer le serveur
	const express = require("express")
	staticServer = express()
	staticServer.disable("x-powered-by")
	staticServer.use(compression())
	await new Promise((resolve, reject) => {
		staticServer.listen(port, async () => {
			consola.box(`${chalk.bgBlueBright(" ROC ")} Serveur statique démarré\n\n ${chalk.dim("┃")} ${chalk.bold("Environnement")}    ${isDev ? "Développement" : "Production"}\n ${chalk.dim("┃")} ${chalk.bold("Commit")}           ${lastCommitHash || "Inconnu"}\n\n ${chalk.dim("┃")} ${chalk.bold("Local")}            ${chalk.blueBright(`http://127.0.0.1:${port}`)}\n ${chalk.dim("┃")} ${chalk.bold("Réseau")}           ${chalk.blueBright(`http://${await getLocalIP()}:${port}`)}`),
			resolve()
		})

		// En cas d'erreur
		staticServer.on("error", (err) => {
			// Si c'est car le port est déjà utilisé
			if(err.code == "EADDRINUSE" || err.code == "EACCES") return startStaticServer(port + 10)
			else { // sinon on affiche juste l'erreur
				consola.warn(err?.message || err?.toString() || err)
			}
		})
	})

	// Log chaque requête
	staticServer.use((req, res, next) => {
		consola.log(`${chalk.green(req.method)} ${req.url}`)
		next()
	})

	// On sert tout les fichiers du dossier de build
	var buildFiles = walk(buildDir)
	buildFiles.forEach(filePath => {
		function addRoute(routePath){
			staticServer.get(routePath.startsWith("/") ? routePath : `/${routePath}`, async (req, res) => {
				if(filePath.endsWith(".html")){
					if(!req.url.endsWith("/")) return res.redirect(`${req.url}/`) // Ajouter un slash à la fin de l'URL

					var fileContent
					try {
						fileContent = fs.readFileSync(filePath)
						fileContent = fileContent.toString()
					} catch (err) {
						consola.error(`Impossible de récupérer le fichier situé à "${filePath}"`)
						consola.error(err)
						return res.status(500).setHeader("Content-Type", "text/plain").send("Roc | Erreur interne du serveur, veuillez réessayer...")
					}

					// Si le fichier contient une redirection
					if(fileContent.includes("<meta http-equiv=\"refresh\" content=\"0; url=")){
						var redirectUrl = fileContent.split("<meta http-equiv=\"refresh\" content=\"0; url=")[1].split("\">")[0]
						if(redirectUrl.length) return res.redirect(redirectUrl)
					}

					res.setHeader("Content-Type", "text/html").send(fileContent)
				} else {
					var mimeType = mime.getType(filePath)
					res.setHeader("Content-Type", mimeType == "application/octet-stream" ? "text/plain" : (mimeType || "text/plain")).sendFile(filePath)
				}
			})
		}

		// Éviter de servir certains fichiers
		if(filePath.endsWith(".nojekyll")) return

		// Fichier index.html à la racine du dossier publique
		if(path.relative(buildDir, filePath) == "index.html") addRoute("/")

		// Fichier index.html dans un dossier
		else if(path.relative(buildDir, filePath).includes("/") && path.relative(buildDir, filePath).split("/").slice(-1)[0] == "index.html"){
			addRoute(path.relative(buildDir, filePath).split("/").slice(0, -1).join("/"))
		}

		// Autres routes
		else {
			addRoute(path.relative(buildDir, filePath))
			if(filePath.endsWith(".html")) addRoute(path.relative(buildDir, filePath).slice(0, -5)) // permettre d'accéder à la page sans le .html
		}
	})

	// On ajoute la page 404
	staticServer.use((req, res) => {
		// dans le cas où la page d'erreur 404 contient une redirection (en raison du _routing.json), il est mieux de servir
		// une page avec un statut 404 qui redirige ailleurs, plutôt que de directement rediriger vers une autre page.
		// cela permet de ne pas avoir de faux résultats dans les moteurs de recherche, qui penseraient que certaines 404 soient valides.
		if(fs.existsSync(path.join(buildDir, "404.html"))) return res.status(404).sendFile(path.join(buildDir, "404.html"))
		res.status(404).send(`404: la page "${req.url}" n'existe pas.`)
	})

	// On vérifie que le dossier "build" existe et contient des fichiers
	if(!fs.existsSync(buildDir)) return consola.warn(`Le dossier "${config.buildDir}" n'existe pas/est vide. Vous devez utiliser la commande "roc build" avant de démarrer le serveur statique.`)
}

/**
 * Initialise le serveur Roc
 * @param {Object} options Options du client
 * @param {Number} options.port Port utilisé par le serveur, `process.env.PORT` restera prioritaire
 * @param {Boolean} options.logger Affiche des logs concernant le serveur dans le terminal
 * @param {Boolean} options.interceptRequests Les requêtes vers le serveur devront être gérés par votre logique
 * @param {Boolean} options.exposeComponents Autorise l'accès aux fichiers dans le dossier `public/components`
 * @param {Boolean} options.serversideCodeExecution Autorise l'exécution de code côté serveur dans les pages via la syntaxe `{{ ... }}`
 * @param {Boolean} options.liveReload Recharge automatiquement la page lorsqu'un fichier est modifié
 * @param {Boolean} options.useTailwindCSS Injecte Tailwind CSS dans les pages HTML générées
 * @param {Boolean} options.minifyHtml Les fichiers HTML générés seront minifiés avant l'envoi
 * @param {String} options.path Chemin contenant les fichiers de votre projet
 * @returns {RocServer} Serveur Roc
*/
function RocServer(options = { port: 3000, logger: true, interceptRequests: false, exposeComponents: false, serversideCodeExecution: true, liveReload: false, useTailwindCSS: false, minifyHtml: true }){
	// Vérifier qu'un chemin valide est fourni
	if(!options.path) throw new Error("Vous devez fournir un chemin valide vers les fichiers de votre projet")
	try {
		fs.accessSync(options.path)
		if(!fs.lstatSync(options.path).isDirectory()) throw new Error("Le chemin fourni doit mener vers un dossier et non un fichier")
	} catch (err) {
		throw new Error("Le chemin fourni n'est pas valide, celui-ci doit correspondre à un dossier existant")
	}

	// Obtenir le package.json du projet
	try {
		var pkgPath = path.join(options.path, "package.json")
		projectPkg = require(pkgPath)
	} catch (err) {
		projectPkg = null
	}

	// Initialiser les variables
	var serverOptions = {
		interceptRequests: options.interceptRequests,
		exposeComponents: options.exposeComponents,
		serversideCodeExecution: options.serversideCodeExecution,
		useTailwindCSS: options.useTailwindCSS,
		minifyHtml: options.minifyHtml,
		devPort: options.port,
		liveReloadEnabled: options.liveReload
	}
	var varResponse = initVariables(serverOptions)
	if(varResponse != true) throw new Error(varResponse)
	this.readonlyOptions = serverOptions
	globalLiveReloadEnabled = options.liveReloadEnabled == true && isDev
	projectPath = path.resolve(options.path)

	// Recréer le logger si on l'a activé
	if(options.logger) consola.level = 3
	this.isDev = isDev

	// Event handling
	this.on = function(event, callback) {
		if(_events[event]) _events[event].push(callback)
	}
	this._emit = function(event, data1, data2){
		if(_events[event]) _events[event].forEach(callback => callback(data1, data2))
	}
	_dynamicEmitter = this._emit

	// Fonction pour démarrer le serveur
	this.start = async function(){
		// Démarrer le serveur
		await startServer(options.port)
		this._emit("ready")
	}

	// Générer le contenu d'une route
	this.generateHTML = function(routePath){
		if(!routePath) return false
		var route = routes.find(r => r.path == routePath)
		if(!route) return false
		if(!route?.file) return false

		return generateHTML(route.file, routePath, server?.address ? server?.address()?.port : options?.port, { disableTailwind: route?.options?.disableTailwind, disableLiveReload: route?.options?.disableLiveReload, preventMinify: route?.options?.preventMinify, forceMinify: route?.options?.forceMinify })
	}
	this.generateJS = async function(routePath){
		if(!routePath) return false
		var route = routes.find(r => r.path == routePath)
		if(!route) return false
		if(!route?.file) return false

		var content
		try {
			content = fs.readFileSync(route.file, "utf8")
		} catch (err) {
			content = null
		}

		if(content) try {
			if(!route.options?.preventMinify){
				if(minifiedFiles[route.file]) content = minifiedFiles[route.file]
				else {
					try {
						if(!Terser) Terser = require("terser")
						content = (await Terser.minify(content))?.code || content
						if(!isDev) minifiedFiles[route.file] = content
					} catch (err) {
						consola.warn(`Erreur lors de la minification du fichier ${route?.file || route}`, err?.message || err?.toString() || err)
					}
				}
			}
		} catch (err) {}

		return content
	}

	return this
}
module.exports = { server: RocServer, version: rocPkg?.version || "Inconnu" }