# ROC

ROC est un générateur de site imaginé pour être le plus facile à utiliser pour ceux qui ont l'habitude de développer des sites web avec du HTML et du JavaScript.

ROC embarque nativement des outils pour faciliter le développement comme une optimisation des fichiers lors du build, un serveur de développement avec rafraîchissement automatique, un système de routage minimale et plus encore.


## (CLI) Création d'un projet

Il n'existe pas encore d'outil capable de créer un projet automatiquement, mais il est possible de créer un projet manuellement :

```bash
# Optionnel : créer un nouveau dossier
mkdir mon-projet
cd mon-projet

# Vous devrez télécharger l'exemple présent dans le dossier "examples/static"
# GUI (Web) : https://download-directory.github.io/?url=https%3A%2F%2Fgithub.com%2Fjohan-perso%2Froc-framework%2Ftree%2Fmain%2Fexamples%2Fstatic
git clone github.com/johan-perso/roc-framework --branch main --single-branch roc-framework-starter
mv roc-framework-starter/examples/static/* .
rm -rf roc-framework-starter

# Installer les dépendances
npm install
npm install roc-framework@latest
# ou pnpm install && pnpm install roc-framework@latest

# Lancer le serveur de développement
npm run dev
# ou pnpm dev
```

> Vous pourrez commencez à coder en modifiant le fichier `public/index.html` !


## (CLI) Liste des commandes

### Développement

Pour lancer le serveur de développement, il suffit d'exécuter la commande suivante :

```bash
npm run dev
# ou pnpm dev
```

> Un serveur de développement sera lancé sur le port 3000 par défaut, vous pouvez changer ce port dans le fichier `roc.config.js`.

### Build

La construction d'un projet permet d'optimiser les fichiers pour une utilisation en production. Ceux-ci seront ensuite utilisables pour un déploiement sur des services comme GitHub Pages ou Vercel. Pour construire un projet, il suffit d'exécuter la commande suivante :

```bash
npm run build
# ou pnpm build
```

> Les fichiers seront placés dans le dossier `build` par défaut, vous pouvez changer l'emplacement dans le fichier `roc.config.js`.

### Démarrer un serveur

Dans le cas où vous ne souhaitez pas configurer un serveur tel que Nginx ou Apache pour servir les fichiers après build, ROC inclut un serveur minimaliste qui peut être utilisé pour servir les fichiers. Pour démarrer ce serveur, il suffit d'exécuter la commande suivante :

```bash
npm start
# ou pnpm start
```

> Chaque démarrage lancera un build avant de démarrer le serveur, vous pouvez ignorer cette étape en ajoutant l'option `--no-build` à la commande.

> Il est en général préférable de servir les fichiers statiquement pour obtenir de meilleures performances.


## (CLI) Configuration

La configuration de ROC se fait en modifiant le fichier `roc.config.js`. Ce fichier contient un objet avec les propriétés suivantes :

* `useTailwindCSS` | `boolean` : détermine si Tailwind CSS doit être utilisé ou non
* `exposeComponents` | `boolean` : autorise l'accès aux fichiers dans le dossier `public/components`
* `serversideCodeExecution` | `boolean` : autorise l'exécution de code côté serveur dans les pages via la syntaxe `{{ ... }}`
* `buildDir` | `string` : chemin vers le dossier de build
* `minifyHtml` | `boolean` : détermine si le code HTML doit être minifié ou non (Tailwind CSS est toujours minifié)
* `devPort` | `number` : port du serveur de développement (la variable d'environnement `PORT` restera prioritaire)
* `devOpenBrowser` | `boolean` : détermine si le navigateur doit s'ouvrir automatiquement lors du lancement du serveur de développement ; la variable d'environnement `ROC_DEFAULT_BROWSER` permet de changer le navigateur par défaut


---


## (Dynamique) Création d'un projet

Il n'existe pas encore d'outil capable de créer un projet automatiquement, mais il est possible de créer un projet manuellement :

```bash
# Optionnel : créer un nouveau dossier
mkdir mon-projet
cd mon-projet

# Vous devrez télécharger l'exemple présent dans le dossier "examples/static"
# GUI (Web) : https://download-directory.github.io/?url=https%3A%2F%2Fgithub.com%2Fjohan-perso%2Froc-framework%2Ftree%2Fmain%2Fexamples%2Fdynamic
git clone github.com/johan-perso/roc-framework --branch main --single-branch roc-framework-starter
mv roc-framework-starter/examples/dynamic/* .
rm -rf roc-framework-starter

# Installer les dépendances
npm install
npm install roc-framework@latest
# ou pnpm install && pnpm install roc-framework@latest

# Lancer le serveur de développement
npm run dev
# ou pnpm dev
```

> Vous pourrez commencez à coder en modifiant le fichier `index.js` et `public/index.html` !


## (Dynamique) Fonctionnement

```js
var roc = require('roc')

var server = new roc.server({
	port: 3000, // process.env.PORT restera prioritaire dans tous les cas
	logger: true, // important, vous ne verrez pas les erreurs si désactivé
	path: './public', // chemin contenant vos pages web

	interceptRequests: true, // vous ne pourrez pas répondre manuellement aux requêtes si désactivé. Si activé, vous *devrez* répondre manuellement aux requêtes

	exposeComponents: false, // autorise l'accès aux fichiers dans le dossier qui contient les composants customs
	serversideCodeExecution: true, // autorise l'exécution de code côté serveur dans les pages via la syntaxe `{{ ... }}`
	liveReloadEnabled: true, // sera désactivé si process.env.NODE_ENV = 'production'
	useTailwindCSS: true,
	minifyHtml: true, // les pages HTML et les fichiers JavaScript seront minifiés, Tailwind CSS sera minifié et inclut dans la page, les autres fichiers ne seront pas impactés
})

server.on('ready', () => { console.log('received msg ready!') }) // facultatif, permet de savoir quand le serveur est démarré
server.on('request', (req, res) => { // requis si l'option interceptRequests est à true
	// Ici, vous pourrez répondre aux requêtes que vous recevez en fonction de vos critières
	// Vous pouvez lire la requête `req` et y répondre avec les fonctions présentes dans `res`

	// res.initialAction = { type: 'sendHtml' | 'sendJs' | 'sendFile' | 'redirect' | '404', content: string }
	// res.send(bool statusCode, string content, object options)
	// res.sendFile(bool statusCode, string filePath, object options)
	// res.json(bool statusCode, object content, object options)
	// res.redirect(bool statusCode, string url, object options)
	// res.send404()

	// à l'heure actuelle, `options` ne permet que de définir des `headers` retournés avec la réponse

	if(res.initialAction.type == 'sendHtml') res.send(200, res.initialAction.content.replaceAll('ROC', 'ROC Dynamic')) // TODO (user): à remplacer, c'est un simple exemple
	if(res.initialAction.type == 'sendJs') res.send(200, res.initialAction.content, { headers: { 'Content-Type': 'application/javascript' } })
	if(res.initialAction.type == 'sendFile') res.sendFile(200, res.initialAction.content)
	if(res.initialAction.type == 'redirect') res.redirect(302, res.initialAction.content)
	if(res.initialAction.type == '404') res.send404()
})

server.start()

/*
	Vous pouvez aussi générer le contenu HTML d'une page web en utilisant la méthode :
	`server.generateHtml(routePath: string)`

	Un fichier JavaScript peut être envoyé tel quel, ou minifié (si non désactivé) avec la méthode :
	`await server.generateJs(routePath: string)`
*/
```

> Roc Dynamic a été créé par dessus le CLI, il est donc compliqué de démarrer plusieurs serveurs dans le même processus.


---


## Utilisation de Tailwind CSS

[Tailwind CSS](https://tailwindcss.com/) permet de styliser une page web plus simplement, et sans écrire de CSS soi-même. Pour l'utiliser avec ROC, il suffit de modifier la propriété `useTailwindCSS` dans le fichier `roc.config.js`.

Le contenu de toutes les pages web HTML inclura automatiquement Tailwind CSS. Il est cependant possible de désactiver Tailwind CSS pour une page en particulier via le fichier de routage.

Pour ajouter du CSS personnalisé, il suffit de créer un fichier `style.css` dans le dossier `public`, ce fichier sera directement inclus dans le CSS généré avec Tailwind CSS.

> Pour plus d'informations sur le fonctionnement de Tailwind CSS, vous pouvez consulter leur [documentation](https://tailwindcss.com/docs).


## Utilisation du routage

ROC embarque un système de routage simple à utiliser.

Tous les fichiers .html dans le dossier `public` seront automatiquement considérés comme des pages web et bénéficieront de fonctionnalité comme la minification, l'utilisation de Tailwind CSS et le rafraîchissement automatique pendant le développement. Les autres fichiers seront également accessibles sans ces fonctionnalités.

Vous pouvez aussi ajouter une route personnalisée depuis le fichier de routage `public/_routing.json`. Ce fichier doit contenir un objet par route, avec ce format : `"/chemin/vers/la/page": { "options": { ... } }`.

* `options` | `object` : options pour cette route, voir ci-dessous.

Les options disponibles sont les suivantes :

* `redirect` | `string` : redirige vers une autre route, incompatible avec `showFile`.
* `showFile` | `string` : affiche un fichier, incompatible avec `redirect`.

* `disableTailwind` | `boolean` : désactive Tailwind CSS pour cette route.
* `disableLiveReload` | `boolean` : désactive le Live Reload pour cette route.
* `preventMinify` | `boolean` : désactive la minification pour cette route, s'il s'agit d'une page HTML.
* `forceMinify` | `boolean` : force la minification pour cette route, s'il s'agit d'une page HTML.

> Les routes sont prioritaires sur les fichiers, si une route est définie pour une page, le fichier ne sera pas utilisé.
> Une route doit inclure l'option `showFile` ou `redirect` pour fonctionner, sauf sur serveur dynamique. Si elle ne contient aucun des deux mais qu'un fichier existe, celui-ci sera utilisé.

Exemple :

```json
{
	"/ex": {
		"options": {
			"redirect": "exemple",
			"disableTailwind": true,
			"preventMinify": true,
		}
	},
	"/accueil": {
		"options": {
			"forceMinify": true,
			"showFile": "public/index.html"
		}
	},
	"/test": {
		"method": "POST",
		"options": {
			"showFile": "public/test.txt"
		}
	}
}
```


## Exécution de code côté serveur pendant le build

Il est possible depuis une page HTML d'exécuter du code JavaScript côté serveur lors du build. Pour cela, vous n'avez qu'à inclure du code entre deux accolades (`{{ ... }}`) dans votre page HTML.

Exemple :

```html
<p>Compiled at {{ new Date().toLocaleString() }}</p>
```
produira :
```html
<p>Compiled at 07/06/2023, 11:38:45</p>
```

Le code est exécuté dans le même processus que roc, il est donc possible d'utiliser des librairies, des fonctions natives, des éléments systèmes, des variables globales, etc. Certaines propriétés ont été rajoutées pour améliorer l'utilisation de cette fonctionnalité : `routeFile`, `isDev`, `escapeHtml(unsafe: string)` et `getHtmlComponent(componentPath: string)`, `options`. Lors de l'exécution de code depuis un composant, les propriétés `componentName` et `componentAttribs` sont également disponibles.

Exemple :

```html
<p>{{ escapeHtml('Hello <World>') }}</p>
```
produira :
```html
<p>Hello &lt;World&gt;</p>
```


## Composants

Roc intègre un système de composants minimes pour éviter les répétitions dans vos pages WEBs. Chaque composant doit être gardé dans un fichier séparé, situé dans le dossier `public/components` avec l'extension `.html`. Le nom du fichier utilisé pour votre composant sera celui à utiliser dans votre page.

### Exemple

```bash
$ tree
.
├── _routing.json
├── components
│   ├── BlockFeature.html
│   └── SectionFeature.html
├── index.html
```

```bash
$ bat components/BlockFeature.html
───────┬────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
       │ File: components/BlockFeature.html
───────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
   1   │ <div class="bg-[#0F0F0F] rounded-md border border-[#27272A] max-sm:space-y-4 w-full h-full py-8 px-8 gap-8 shadow-md">
   2   │     <h3 class="font-[Rethink] text-white text-[26px] min-[2000px]:text-3xl font-medium">{{ $title }}</h3>
   3   │     <p class="mt-1 min-[2000px]:mt-3 font-[Geist] text-[#A1A1AA] text-lg min-[2000px]:text-[22px] leading-relaxed">
   4   │         {{ $content }}
   5   │     </p>
   6   │ </div>
```

```bash
$ bat index.html
───────┬────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
       │ File: index.html
───────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
 164   │ <BlockFeature title="Exemple" content="Hello world from a component, rendered with zero client-side JavaScript."></BlockFeature>
 165   │ <!-- ✅ <BlockFeature></BlockFeature> -->
 165   │ <!-- ❌ <BlockFeature /> -->
```

### Attributs et exécution de code

Comme dans l'exemple, ajoutez simplement un attribut lorsque vous incluez le composant dans votre page WEB, pour l'utiliser avec la syntaxe `{{ $nom_de_l_attribut }}` dans celui-ci. Vous pouvez aussi les utiliser via l'exécution de code `{{ this.componentAttribs.nom_de_l_attribut }}` pour les afficher selon une certaine logique.


## Versions des libs intégrées

| Librairie     | Version |
| ------------- | ------- |
| Tailwind CSS  | 3.4.17  |
| daisyUI       | 4.12.23 |


## Déploiement

### Vercel

Vous pouvez déployer votre projet sur Vercel à l'aide du fichier `vercel.json` fourni dans l'exemple de base : vous n'aurez qu'à lancer un déploiement avec `vercel --prod` ou l'intégration Git, et Vercel s'occupera du reste.

> Déconseillé pour les projets dynamiques.

### Ailleurs

**Statique :** pour servir votre site, vous pouvez utiliser un simple hébergeur web et lui donner les fichiers présents dans le dossier `build` après la phase de build. Sur votre infrastructure, vous pouvez utiliser un serveur web tel que Nginx ou Apache pour servir les fichiers.
**Dynamique :** vous aurez besoin d'une machine en capacité d'exécuter votre fichier JavaScript (un VPS par exemple), ROC s'occupera du serveur et vous n'aurez pas besoin de Nginx ou d'alternatives similaires.



## Licence

MIT © [Johan](https://johanstick.fr)