//this script is runned manually, for copy electron build to update server

//first run yarn build:electron
//update server must be mounted via sshfs to ~/update by command: sshfs vadik@update:/var/www/update.ilfumo.ru/public_html ~/update

//steps:
//copy packages
//copy binaries to history subdirectory
//add RELEASES info
//update permanent binaries
//append info to index.html
//DONE!

var fs = require('fs');
var path = require('path');
const mkdirp = require('mkdirp');

const distDir = __dirname + "/../electron_app/dist"
const homedir = require('os').homedir();

const updateDir = homedir + "/update"
const riotDir = updateDir + "/riot"

const indexHtmlPath = updateDir + "/index.html"

console.log('START deploy to ' + updateDir)

///Users/vkandrushin/update_test/index.html
if (!fs.existsSync(indexHtmlPath)){
    console.log(`index.html in ${indexHtmlPath} not found. please mount update!`)
    return
}

Number.prototype.pad = function(size) {
    var s = String(this);
    while (s.length < (size || 2)) {s = "0" + s;}
    return s;
}

const distInfo = {
    mac: {
        dir: "/",
        bin: /^ilfumo Riot-(.+).dmg$/,
        pkg: /^ilfumo Riot-(.+)-mac.zip$/,

        updateBinName: "ilfumo_Riot.dmg",
        updateDir: "/macos",
        releasesJson: true
    },
    win86:{
        dir: "/squirrel-windows-ia32/",
        bin: /^ilfumo Riot Setup (.+).exe$/,
        pkg: /^ilfumo-riot-web-(.+)-full.nupkg$/,

        updateBinName: "ilfumo_Riot_x86.exe",
        updateDir: "/win32/ia32"
    },
    win64:{
        dir: "/squirrel-windows/",
        bin: /^ilfumo Riot Setup (.+).exe$/,
        pkg: /^ilfumo-riot-web-(.+)-full.nupkg$/,

        updateBinName: "ilfumo_Riot_x64.exe",
        updateDir: "/win32/x64"
    }
}

const infos = Object.keys(distInfo).map(k => distInfo[k]);

//first let's copy package files and binaries
infos.forEach(info =>{
    info.absDir = distDir + info.dir

    const files = fs.readdirSync(info.absDir)

    files.forEach(fileName => {
        const filePath = path.join(info.absDir, fileName)
        
        let match = fileName.match(info.bin)
        if (match){
            info.binVersion = match[1]
            info.binPath = filePath
            info.binName = fileName
            info.binHistoryDir = path.join(riotDir, "history", info.updateDir)
            info.binHistoryPath = path.join(info.binHistoryDir, fileName)
            mkdirp.sync(info.binHistoryDir);

            if (fs.existsSync(info.binHistoryPath)){
                console.log(`Skip ${filePath}. Already in ${info.binHistoryPath}}`)
            }else{
                console.log(`copy ${filePath} to ${info.binHistoryPath}}`)
                fs.copyFileSync(filePath, info.binHistoryPath)
            }

            return
        }

        match = fileName.match(info.pkg)
        if (match){
            info.pkgVersion = match[1]
            info.pkgPath = filePath
            info.pkgName = fileName

            info.absUpdateDir = riotDir + info.updateDir
            const updatePath = info.absUpdateDir + '/' + fileName
            if (fs.existsSync(updatePath)){
                console.log(`Skip ${filePath}. Already in ${updatePath}}`)
            }else{
                console.log(`copy ${filePath} to ${updatePath}`)
                fs.copyFileSync(filePath, updatePath)
            }
        }

        if (fileName == "RELEASES"){
            info.releasesPath = filePath
        }
    })
})

//WINDOWS. append to RELEASES
infos.filter(i => i.releasesPath).forEach(info =>{
    const updateReleasesPath = info.absUpdateDir + '/RELEASES'
    console.log(`replace RELEASES from ${info.releasesPath} to ${updateReleasesPath}`)
    fs.copyFileSync(info.releasesPath, updateReleasesPath)
    /*
    const releaseContent = fs.readFileSync(info.releasesPath, {encoding:'utf8'})
    const updateContent =  fs.readFileSync(updateReleasesPath, {encoding:'utf8'})
    if (updateContent.includes(releaseContent)){
        console.log('already added in ' + updateReleasesPath)
        return
    }
    console.log('add new RELEASES info to ' + updateReleasesPath)
    fs.appendFileSync(updateReleasesPath, '\n' + releaseContent)*/
})

//macos. append to RELEASES.json
infos.filter(i => !!i.releasesJson).forEach(info =>{
    const releasesJsonPath = path.join(info.absUpdateDir, "RELEASES.json")
    const releaseContent = fs.readFileSync(releasesJsonPath, {encoding:'utf8'}).trim()
    const releases = JSON.parse(releaseContent)

    if (releases.currentRelease == info.pkgVersion){
        console.log('already added in ' + releasesJsonPath)
        return
    }

    releases.currentRelease = info.pkgVersion
    releases.releases.push({
        "version": info.pkgVersion,
        "updateTo": {
            "version": info.pkgVersion,
            "pub_date": new Date().toISOString(),//"2019-07-05T21:29:53+01:02",
            "notes": "update to " + info.pkgVersion,
            "name": info.pkgName,
            "url": encodeURI(`https://update.ilfumo.ru/riot/macos/${info.pkgName}`)
        }
    })
    fs.writeFileSync(releasesJsonPath, JSON.stringify(releases, null, 2), {encoding:'utf8',flag:'w'})
})

//REPLACE permanent binaries with new
infos.forEach(info =>{    
    const updateBinPath = path.join(riotDir, info.updateBinName)
    const updateBinPathTmp = updateBinPath + "_tmp"

    if (fs.existsSync(updateBinPathTmp)){
        console.log('delete ' + updateBinPathTmp)
        fs.unlinkSync(updateBinPathTmp)
    }

    console.log(`copy ${info.binPath} to ${updateBinPathTmp}`)
    fs.copyFileSync(info.binPath, updateBinPathTmp);
    
    if (fs.existsSync(updateBinPath)){
        console.log('delete ' + updateBinPath)
        fs.unlinkSync(updateBinPath)
    }else{
        console.log('not exists ' + updateBinPath)
    }

    console.log(`rename ${updateBinPathTmp} to ${updateBinPath}`)
    fs.renameSync(updateBinPathTmp, updateBinPath)
})

//update index.html
let indexHtmlContent = fs.readFileSync(indexHtmlPath, {encoding:'utf8'}).trim()
if (indexHtmlContent.includes(`<h3>${distInfo.mac.pkgVersion} `)){
    console.log('already added to index.html')
}else{
    const date = new Date()
    const dateFormat = `${date.getDay().pad()}.${date.getMonth().pad()}.${date.getFullYear()}` //05.07.2019
    indexHtmlContent = indexHtmlContent.replace('<h2>Desktop Changelog</h2>', `<h2>Desktop Changelog</h2>\n<h3>${distInfo.mac.pkgVersion} (${dateFormat})</h3>\n<ul>\n<li>*</li>\n</ul>`)
    fs.writeFileSync(indexHtmlPath, indexHtmlContent, {encoding:'utf8',flag:'w'})
    console.log('append info to index.html')
}

console.log("DONE!!!")