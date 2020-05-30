const fs = require('fs');
const merge = require("deepmerge");
const os = require('os');
const YAML = require("yaml");
const Processor = require("./processor.js");
let settings, processor;
let ROOM_all = global.ROOM_all = [];
let lflists = global.lflists = [];

async function loadYAML(path) {
	const content = await fs.promises.readFile(path, "utf-8");
	return YAML.parse(content);
}
global.loadYAML = loadYAML;


async function saveSettings(config) {
	const path = config.file;
	try {
		await fs.promises.writeFile(path, YAML.stringify(config));
	} catch (e) {
		log.warn("setting save fail", path, e.toString());
	}
}
global.saveSettings = saveSettings;

async function changeSettings(config, path, val) {
	if (_.isString(val)) {
		// path should be like "modules:welcome"
		log.info("setting changed", path, val);
	}
	path = path.split(':');
	if (path.length === 0) {
		config[path[0]] = val;
	} else {
		let key;
		let target = config;
		while (path.length > 1) {
			key = path.shift();
			target = target[key];
		}
		key = path.shift();
		target[key] = val;
	}
	await saveSettings(config);
};
global.changeSettings = changeSettings;

async function loadSettings() {
	const default_config = await loadYAML('./data/default_config.yaml');
	if (!fs.existsSync('./config')) {
		fs.promises.mkdir('./config');
	}
	let config;
	if (fs.existsSync('./config/config.yaml')) {
		try {
			config = await loadYAML('./config/config.yaml');
		} catch (e) {
			console.error("Failed reading config: ", e.toString());
			process.exit(1);
		}
	} else {
		config = {};
	}
	settings = global.settings = merge(default_config, config, {
		arrayMerge: (destination, source) => {
			return source;
		}
	});
}

async function loadYGOProDatas() {
	try {
		const cppversion = parseInt((await fs.promises.readFile('ygopro/gframe/game.cpp', 'utf8')).match(/PRO_VERSION = ([x\dABCDEF]+)/)[1], '16');
		await changeSettings(settings, "version", cppversion);
		log.info("ygopro version 0x" + settings.version.toString(16), "(from source code)");
	} catch (e) {
		log.info("ygopro version 0x" + settings.version.toString(16), "(from config)");
	}
	const lflistFiles = ["./ygopro/expansions/lflist.conf", "./ygopro/lflist.conf"];
	for (let lflistFile of lflistFiles) {
		try {
			const lists = (await fs.promises.readFile(lflistFile, 'utf8')).match(/!.*/g);
			for (let list of lists) {
				const date = list.match(/!([\d\.]+)/);
				if (!date) {
					continue;
				}
				lflists.push({
					date: moment(list.match(/!([\d\.]+)/)[1], 'YYYY.MM.DD').utcOffset("-08:00"),
					tcg: list.indexOf('TCG') !== -1
				});
			}
			log.info("lflist loaded:", lflistFile);
		} catch (e) {}
	}
}

function loadHandlers() {
	processor.addHandler("get_metainfo", async(param, dataID, workerID) => {
		return {
			settings,
			lflists
		};
	});
}

async function main() {
	await loadSettings();
	await loadYGOProDatas();
	if (!settings.nproc) {
		await changeSettings(settings, "nproc", os.cpus().length);
	}
	processor = global.Processor = new Processor(settings.nproc);
	loadHandlers();
	await processor.startWorkers();
	console.log(await processor.addTask("get_memory_usage"));
}
module.exports = main;
