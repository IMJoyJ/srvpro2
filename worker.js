const fs = require('fs');
const Processor = require("./processor.js");
let settings, processor, lflists;
async function main() { 
	processor = global.Processor = new Processor();
	const metaInfo = await processor.addTask("get_metainfo");
	console.log(metaInfo);
}
module.exports = main;
