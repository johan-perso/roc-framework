#!/usr/bin/env node

// Importer les modules
const fs = require("fs")
const path = require("path")
const sqwish = require("sqwish")
const htmlMinify = require("html-minifier").minify
const chalk = require("chalk")
const { consola } = require("consola")
const cheerio = require("cheerio")
const pkg = require("./package.json")
require("dotenv").config()
if(process.isTTY) process.stdin.setRawMode(false) // j'sais même pas comment mais ça règle v'là les problèmes avec les raccourcis clavier (genre CTRL+C qui quitte le programme nativement)

// Fonction pour échapper du HTML // pouvant être utile pour les sites qui ont du code traité par le serveur
function escapeHtml(unsafe){ // eslint-disable-line
	return unsafe.toString().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;")
}

// Lire le fichier de configuration
var config
try {
	config = require(path.join(process.cwd(), "roc.config.js"))
} catch (err) {
	consola.error(new Error("Impossible de lire le fichier de configuration 'roc.config.js'. Vous avez peut-être mal initialisé le projet dans ce dossier ?"))
	process.exit(1)
}

// Si on utilise pas Tailwind CSS, on recommande de supprimer le fichier de config
if(!config.useTailwindCSS && fs.existsSync(path.join(process.cwd(), "tailwind.config.js"))) consola.warn("Vous avez désactivé l'utilisation de Tailwind CSS, vous pouvez supprimer le fichier \"tailwind.config.js\"")

// Obtenir son IP local
async function getLocalIP(){
	var ip = require("os").networkInterfaces()["Wi-Fi"]?.filter(i => i?.family == "IPv4")[0] || Object.values(require("os").networkInterfaces()).flat().filter(({ family, internal }) => family === "IPv4" && !internal).map(({ address }) => address)[0] || await require("dns").promises.lookup(require("os").hostname())
	return ip.address || ip || "<votre ip local>"
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
	walk(path.join(process.cwd(), "public")).forEach(file => {
		// Nom du fichier
		var fileName = path.basename(file)

		// Ne pas ajouter certaines routes
		if(path.relative(path.join(process.cwd(), "public"), file) == "_routing.json") return // fichier de routing
		if(path.relative(path.join(process.cwd(), "public"), file) == "404.html") return // page d'erreur 404
		if(fileName == ".DS_Store") return // fichiers .DS_Store

		// Ajouter la route
		if(file.endsWith(".html")) routes.push({ path: `/${path.relative(path.join(process.cwd(), "public"), file) == "index.html" ? "" : path.relative(path.join(process.cwd(), "public"), file).replace(/\\/g, "/")}`, file: file })
		else routes.push({ path: `/${path.relative(path.join(process.cwd(), "public"), file).replace(/\\/g, "/")}`, file: file })
	})
	return routes
}

// Générer le Tailwind CSS
const postcss = require("postcss")
const tailwind = require("tailwindcss")
var tailwindCSS
async function generateTailwindCSS(){
	try {
		// Vérifier la configuration
		var twConfigContent = fs.readFileSync(path.join(process.cwd(), "tailwind.config.js"))
		if(twConfigContent) var twConfig = eval(twConfigContent.toString())
		if(twConfig?.daisyui?.logs != false) return consola.warn("Il est recommendé de désactiver les logs de DaisyUI dans le fichier de configuration Tailwind CSS: daisyui: { logs: false }")

		// Obtenir le CSS supplémentaire (style.css et styles.css)
		var extraCSS = ""
		if(fs.existsSync(path.join(process.cwd(), "public", "style.css"))) extraCSS += fs.readFileSync(path.join(process.cwd(), "public", "style.css"), "utf8")
		if(fs.existsSync(path.join(process.cwd(), "public", "styles.css"))) extraCSS += fs.readFileSync(path.join(process.cwd(), "public", "style.css"), "utf8")

		// Générer et retourner le CSS
		const result = await postcss([
			tailwind({ config: path.join(process.cwd(), "tailwind.config.js"), }),
		]).process(`@tailwind base;@tailwind components;@tailwind utilities;${extraCSS}`, { from: undefined })
		tailwindCSS = result.css
		return result.css
	} catch (err) {
		consola.warn("Erreur lors de la génération de Tailwind CSS", err)
	}
}

// Générer le code HTML d'une page
function generateHTML(routeFile, devServPort, options = { disableTailwind: false, disableLiveReload: false, preventMinify: false, forceMinify: false }){
	// Lire le fichier HTML
	var html
	try {
		html = fs.readFileSync(path.join(routeFile), "utf8")
	} catch (err) {
		html = "_404"
	}
	if(html == "_404") return `404: le fichier "${routeFile}" n'existe pas.`

	// Parser le DOM
	var dom = cheerio.load(html, { xml: { xmlMode: false, decodeEntities: false } })
	var domHead = dom("head")
	var domBody = dom("body")
	// TODO: vérifier que ces modifications fonctionne dans le code qui s'exécute quand on build
	// Ajouter un header "generator" dans le head
	if(domHead) var domHeadGenerator = domHead.find("meta[name='generator']")
	if(domHead && !domHeadGenerator.length) domHead.append(`<meta name="generator" content="ROC v${pkg.version}">`)

	// Si on est en développement, on va ajouter le live reload
	if(process.argv.slice(2)[0] == "dev" && !options.disableLiveReload){
		if(domHead) domHead.append(`<script>url=new URL('ws://'+location.host),url.port=${devServPort + 1};new WebSocket(url).onmessage=(e)=>{if(e.data=='re')location.reload()}</script>`)
		else if(domBody) domBody.append(`<script>url=new URL('ws://'+location.host),url.port=${devServPort + 1};new WebSocket(url).onmessage=(e)=>{if(e.data=='re')location.reload()}</script>`)
	}

	// Si on utilise Tailwind CSS, on va minifier le CSS et l'insérer dans l'HTML
	if(config.useTailwindCSS && !options.disableTailwind && tailwindCSS){
		var minifiedCSS = sqwish.minify(tailwindCSS)
		if(domHead) domHead.append(`<style>${minifiedCSS}</style>`)
		else if(domBody) domBody.append(`<style>${minifiedCSS}</style>`)
	}

	// Transformer le DOM en HTML
	html = dom.html({ xml: { xmlMode: false, decodeEntities: false } })

	// Pouvoir exécuter du code depuis le fichier HTML, côté serveur
	try {
		html = html.replace(/{{([\s\S]*?)}}/g, (match, p1) => {
			console.log(p1)
			return eval(p1.trim())
		})
	} catch (err) {
		consola.warn(`Erreur lors de l'évaluation du code dans le fichier ${routeFile}`, err)
	}
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

	// Si c'est le tout premier démarrage, on va préparer le live reload
	if(serverRestart == 0){
		const WebSocket = require("ws")
		wss = new WebSocket.Server({ port: port + 1 })
	}

	// Si on utilise Tailwind CSS
	if(config.useTailwindCSS){
		// On vérifie si la config de Tailwind CSS existe
		if(!fs.existsSync(path.join(process.cwd(), "tailwind.config.js"))){
			fs.writeFileSync(path.join(process.cwd(), "tailwind.config.js"), "/** @type {import('tailwindcss').Config} */\nmodule.exports = {\n\tcontent: ['./public/**/*.{html,js}'],\n\tplugins: [require('daisyui')],\n\tdaisyui: {\n\t\tlogs: false,\n\t\tthemes: [\n\t\t\t\"dark\"\n\t\t],\n\t}\n}")
			consola.success("Fichier de configuration Tailwind CSS créé")
		}

		// On génère le CSS
		generateTailwindCSS()
	}

	// Importer le serveur
	const express = require("express")
	app = express()
	app.disable("x-powered-by")
	await new Promise((resolve, reject) => {
		server = null
		server = app.listen(port, async () => {
			// Afficher les boxes dans la console
			consola.box(`${chalk.bgBlueBright(" ROC ")} Serveur de développement démarré\n\n ${chalk.dim("┃")} ${chalk.bold("Local")}      ${chalk.blueBright(`http://127.0.0.1:${port}`)}\n ${chalk.dim("┃")} ${chalk.bold("Réseau")}     ${chalk.blueBright(`http://${await getLocalIP()}:${port}`)}${global.tunnelLink ? `\n ${chalk.dim("┃")} ${chalk.bold("Externe")}    ${chalk.blueBright(global.tunnelLink)}` : ""}`),
			process.stdin.isTTY ? consola.box(`${chalk.bgBlueBright(" ROC ")} Raccourcis disponibles :\n\n ${chalk.dim("━")} ${chalk.bold("r")}         ${chalk.blueBright("Redémarre le serveur en relancant les analyses")}\n ${chalk.dim("━")} ${chalk.bold("q")}         ${chalk.blueBright("Ferme le serveur puis quitte le processus")}\n ${chalk.dim("━")} ${chalk.bold("t")}         ${chalk.blueBright("Ouvre un tunnel accessible hors du réseau")}\n ${chalk.dim("━")} ${chalk.bold("CTRL+L")}    ${chalk.blueBright("Vide le contenu de la console")}`) : `\n${chalk.yellow("⚠")} Les raccourcis clavier ne sont pas disponibles dans cet environnement.\n`

			// Si on a déjà démarré le serveur, on va juste redémarrer
			serverRestart++
			resolve()
		})

		// En cas d'erreur
		server.on("error", (err) => {
			// Si c'est car le port est déjà utilisé
			if(err.code == "EADDRINUSE" || err.code == "EACCES") return startServer(port + 10)
			else { // sinon on affiche juste l'erreur
				consola.error(err?.message || err?.toString() || err)
			}
		})
	})

	// Si on avait pas encore le serveur, on le démarre et on fait quelques autres étapes
	if(serverRestart == 1){
		// Raccourcis clavier
		if(process.stdin.isTTY){
			process.stdin.setRawMode(true)
			process.stdin.resume()
			process.stdin.setEncoding("utf8")
			process.stdin.on("data", async (key) => {
				if(key == "r") return startServer(port) // relance le serveur
				if(key == "\r") return consola.log() // sauter une ligne (ENTER)
				else if(key == "\u000c") return console.clear() // clear
				else if(key == "q" || key == "\u0003") process.exit() // quitter
				else if(key == "t" && !global.tunnelLink){ // ouvrir un tunnel
					consola.info("Ouverture du tunnel...")
					var localtunnel = require("localtunnel")
					var tunnel = await localtunnel({ port: port })
					global.tunnelLink = tunnel.url
					consola.success(`Tunnel ouvert : ${global.tunnelLink || tunnel?.url}`)
				}
				else if(key == "t" && global.tunnelLink) consola.success(`Tunnel déjà ouvert : ${global.tunnelLink}`) // afficher un tunnel déjà ouvert
			})
		}

		// Si on veut ouvrir le navigateur
		if(config.devOpenBrowser) require("open")(`http://127.0.0.1:${server.address().port}`)

		// Quand on modifie un fichier
		const chokidar = require("chokidar")
		chokidar.watch([
			path.join(process.cwd(), "public"),
			path.join(process.cwd(), "roc.config.js"),
			path.join(process.cwd(), "tailwind.config.js")
		], { ignoreInitial: true, ignorePermissionErrors: true }).on("all", async (event, path) => {
			// Log
			if(path.endsWith("roc.config.js")) consola.warn("Le fichier de configuration roc.config.js a été modifié, redémarrez l'ensemble du processus pour appliquer les changements")

			// Si on utilise TailwindCSS et qu'on a modifié un fichier HTML/CSS/JS
			if(config.useTailwindCSS && (path.endsWith(".html") || path.endsWith(".css") || path.endsWith(".js"))) await generateTailwindCSS()

			// Live reload
			if(event == "change") wss.clients.forEach(client => client.send("re"))

			// Si on a un changement du nombre de routes, ou une modification dans le routing, on redémarre le serveur
			if(path.endsWith("_routing.json") || routesCount != getRoutes().length){
				routesCount = routes.length
				return startServer(port) // on redémarre le serveur (mais certaines étapes ne seront pas refaites)
			}
		})
	}

	// On récupère la liste des routes
	if(serverRestart == 1) getRoutes()

	// Si le fichier de routing existe
	if(fs.existsSync(path.join(process.cwd(), "public", "_routing.json"))){
		// On lit le fichier
		var routing
		try {
			routing = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", "_routing.json"), "utf8"))
			routing = Object.entries(routing)
		} catch (err) {
			consola.warn("Erreur lors de la lecture du fichier de routing", err)
		}

		// On les ajoute si on en a
		if(routing) routing.forEach(([route, file]) => {
			// On ajoute la route
			if(file.options?.showFile){
				routes = routes.filter(r => r.path != (route || route.path)) // supprimer l'ancienne
				routes.push({ path: route, method: file.method, file: path.join(process.cwd(), file.options.showFile), options: file.options }) // ajouter la nouvelle
			}
			else if(!file.options && file.method) routes.filter(r => r.path == route.path)[0].method = file.method // modifier l'ancienne
			else if(file.options){
				routes = routes.filter(r => r.path != (route || route.path)) // supprimer l'ancienne
				routes.push({ path: route, method: file.method || "GET", options: file.options }) // ajouter la nouvelle
			}
		})
	}

	// Log les routes
	var minimalRoutes = routes.slice(0, 7)
	consola.info(`${routes.length} route${routes.length > 1 ? "s" : ""} ajoutée${routes.length > 1 ? "s" : ""} :\n  • ${minimalRoutes.map(r => r.path).join("\n  • ")}${routes.length > minimalRoutes.length ? `\n  • ... et ${routes.length - minimalRoutes.length} autres` : ""}`)

	// Log chaque requête
	app.use((req, res, next) => {
		consola.log(`${chalk.green(req.method)} ${req.url}`)
		next()
	})

	// On ajoute les routes
	routes.forEach(route => {
		// Si la méthode n'est pas valide, on ne l'ajoute pas
		if(route.method && !require("http").METHODS.includes(route.method.toUpperCase())) return consola.warn(`La méthode ${route.method} n'est pas valide pour la route ${route.path}`)

		// Fonction pour ajouter la route
		function addRoute(method, routePath){
			app[method](routePath, async (req, res) => {
				// Si on a pas de "file", on vérifie si on doit pas faire une redirection
				if(!route.file && route.options?.redirect) res.redirect(route?.options?.redirect)

				// Sinon, on envoie le fichier
				else if(route.file){
					if(route.file.endsWith(".html")) return res.send(generateHTML(route.file, port, { disableTailwind: route?.options?.disableTailwind, disableLiveReload: route?.options?.disableLiveReload, preventMinify: route?.options?.preventMinify, forceMinify: route?.options?.forceMinify })) // Si c'est un fichier .html, on génère le code HTML
					else res.sendFile(path.join(route.file)) // Sinon on envoie le fichier
				}

				// Si on a pas su quoi faire
				else res.status(404).send(`404: la route "${route.path}" est mal configuré.`)
			})
		}

		// On ajoute la route
		addRoute(route.method?.toLowerCase() || "get", route.path)

		// On en ajoute une autre si elle finit par .html, pour permettre d'accéder à la page sans l'extension
		if(route.path.endsWith(".html")) addRoute(route.method?.toLowerCase() || "get", route.path.slice(0, -5))
	})

	// On ajoute la page 404
	app.use((req, res) => {
		if(fs.existsSync(path.join(process.cwd(), "public", "404.html"))) return res.status(404).send(generateHTML(path.join(process.cwd(), "public", "404.html"), port))
		res.status(404).send(`404: la page "${req.url}" n'existe pas.`)
	})
}

// Générer les routes pour utiliser le site statiquement
async function buildRoutes(){
	// Si le dossier de build n'existe pas, on le crée
	if(!fs.existsSync(path.join(process.cwd(), config.buildDir))) fs.mkdirSync(path.join(process.cwd(), config.buildDir))
	consola.info(`Dossier de build: ${path.join(process.cwd(), config.buildDir)}`)

	// Si on a un fichier dans le dossier build, on supprime tout
	if(fs.readdirSync(path.join(process.cwd(), config.buildDir)).length > 0){
		walk(path.join(process.cwd(), config.buildDir)).forEach(file => {
			fs.unlinkSync(file)
		})
		consola.info("Fichiers du précédent build supprimés")
	}

	// Importer Terser
	const Terser = require("terser")

	// Générer Tailwind CSS
	if(config.useTailwindCSS){
		await generateTailwindCSS()
		consola.info("Code Tailwind CSS généré avec succès")
	}

	// On récupère la liste des routes
	// Note: cette fonction est volontairement différente de celle utilisée pour le serveur de développement : la page 404 est incluse par exemple
	var routes = []
	walk(path.join(process.cwd(), "public")).forEach(file => {
		// Ne pas ajouter le fichier de routing
		if(path.relative(path.join(process.cwd(), "public"), file) == "_routing.json") return

		// Ajouter la route
		routes.push({ path: path.relative(path.join(process.cwd(), "public"), file).replace(/\\/g, "/"), file: file })
	})

	// Si le fichier de routing existe
	if(fs.existsSync(path.join(process.cwd(), "public", "_routing.json"))){
		// On lit le fichier
		var routing
		try {
			routing = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", "_routing.json"), "utf8"))
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
			if(file.options?.showFile) routes.push({ path: route, file: path.join(process.cwd(), file.options.showFile), options: file.options })
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
			else if(route.file && route.file.endsWith(".html")) var content = generateHTML(route.file, 0, { disableTailwind: route?.options?.disableTailwind, preventMinify: route?.options?.preventMinify, forceMinify: route?.options?.forceMinify })

			// Si on a pas su quoi faire
			else if(!route.file) return consola.warn(`Route : ${chalk.blue(route.path)} est mal configuré, vérifier le fichier de routage ou le dossier "public".`)

			// Afficher des avertissements dans certaines situations
			if(content){
				// Vérifier l'attribut "lang=" sur la balise <html> des fichiers .html
				if(route?.file?.endsWith(".html") && content && content.includes("<html") && !content.includes("<html lang=")) consola.warn(`Le fichier ${chalk.blue(route.file)} ne contient pas d'attribut "lang=" sur la balise <html>`)

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
				// Créer les dossiers si besoin
				if(route.path.includes("/") && !fs.existsSync(path.join(process.cwd(), config.buildDir, route.path.split("/").slice(0, -1).join("/")))){
					fs.mkdirSync(path.join(process.cwd(), config.buildDir, route.path.split("/").slice(0, -1).join("/")), { recursive: true })
				}

				// Écrire le fichier
				fs.writeFileSync(path.join(process.cwd(), config.buildDir, route.path), content.toString())
			}

			// Si on a pas de contenu, c'est car c'est pas un fichier HTML, donc on copie le fichier
			else {
				// Si on doit créer des dossiers
				if(route.path.includes("/") && !fs.existsSync(path.join(process.cwd(), config.buildDir, route.path.split("/").slice(0, -1).join("/")))){
					fs.mkdirSync(path.join(process.cwd(), config.buildDir, route.path.split("/").slice(0, -1).join("/")), { recursive: true })
				}

				// Si c'est un fichier JS et qu'on veut le minifier
				if(route.file.endsWith(".js")){
					// On va minifier le fichier
					var minifiedJs = await Terser.minify(fs.readFileSync(route.file, "utf8"))

					// Écrire le fichier
					fs.writeFileSync(path.join(process.cwd(), config.buildDir, route.path), minifiedJs.code)
				}

				// Sinon on va juste copier le fichier
				else fs.copyFileSync(route.file, path.join(process.cwd(), config.buildDir, route.path))
			}

			// Si c'était le dernier fichier
			if(routes.indexOf(route) == routes.length - 1) resolve()
		})
	})
	await generateFilePromise
	consola.info("Fichiers générés dans le dossier de build")

	// Rajouter un fichier .nojekyll pour GitHub Pages
	fs.writeFileSync(path.join(process.cwd(), config.buildDir, ".nojekyll"), "")

	// On finit
	consola.success("Build terminé !")
	return true
}

// Démarrer le serveur statique
var staticServer
async function startStaticServer(port = parseInt(process.env.PORT || config.devPort || 3000)){
	// Si on a déjà un serveur, on le ferme
	if(staticServer) staticServer.close()

	// Importer le serveur
	const express = require("express")
	staticServer = express()
	staticServer.disable("x-powered-by")
	await new Promise((resolve, reject) => {
		staticServer.listen(port, async () => {
			consola.box(`${chalk.bgBlueBright(" ROC ")} Serveur statique démarré\n\n ${chalk.dim("┃")} ${chalk.bold("Local")}      ${chalk.blueBright(`http://127.0.0.1:${port}`)}\n ${chalk.dim("┃")} ${chalk.bold("Réseau")}     ${chalk.blueBright(`http://${await getLocalIP()}:${port}`)}`)
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

	// Si on veut ouvrir le navigateur
	if(config.devOpenBrowser) require("open")(`http://127.0.0.1:${port}`)

	// On ajoute les routes
	staticServer.use(express.static(path.join(process.cwd(), config.buildDir)))

	// On ajoute la page 404
	staticServer.use((req, res) => {
		if(fs.existsSync(path.join(process.cwd(), config.buildDir, "404.html"))) return res.status(404).sendFile(path.join(process.cwd(), config.buildDir, "404.html"))
		res.status(404).send(`404: la page "${req.url}" n'existe pas.`)
	})

	// Log chaque requête
	staticServer.use((req, res, next) => {
		consola.log(`${chalk.green(req.method)} ${req.url}`)
		next()
	})

	// On vérifie que le dossier "build" existe et contient des fichiers
	if(!fs.existsSync(path.join(process.cwd(), config.buildDir))) return consola.warn(`Le dossier "${config.buildDir}" n'existe pas/est vide. Vous devez utiliser la commande "roc build" avant de démarrer le serveur statique.`)
}

// Exécuter certaines fonctions selon les arguments
if(process.argv.slice(2)[0] == "dev") startServer() // serveur de développement
else if(process.argv.slice(2)[0] == "build") buildRoutes() // build les fichiers
else if(process.argv.slice(2)[0] == "start"){
	if(process.argv.slice(2).includes("--no-build")){ // démarrer le serveur statique sans build à cause de l'argument --no-build
		consola.warn("Vous avez utilisé l'argument --no-build, le serveur statique va démarrer sans build.")
		return startStaticServer()
	}
	else buildRoutes().then(result => result == true ? startStaticServer() : process.exit(1)) // build les fichiers puis démarrer le serveur statique
}
else consola.error("Commande inconnue. Liste des commandes disponibles : dev, build, start")