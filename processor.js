const cluster = require("cluster");
const os = require("os");

class Task {
	constructor(id, proto, param, callback, worker) {
		this.id = id;
		this.callback = callback;
		this.solved = false;
		const sendData = {
			id,
			proto,
			param
		}
		if (cluster.isMaster && worker) {
			worker.send(sendData);
		} else {
			process.send(sendData);
		}
	}
	solve(ret) {
		if (this.solved) {
			return;
		}
		this.solved = true;
		this.callback(ret);
	}
}

let curID = 0;

async function sleep(ms) { 
	return new Promise(callback => { 
		setTimeout(callback, ms);
	})
}

class Processor {
	constructor(nproc) {
		this.queue = [];
		this.handlers = {};
		this.nproc = nproc;
		if (cluster.isMaster) {
			this.workerReadyCallbacks = {};
			this.addHandler("ready", async (param, dataID, workerID) => {
				const callback = this.workerReadyCallbacks[workerID];
				if (callback) {
					log.info("Worker started:", workerID);
					callback();
				}
			});
			cluster.on("message", Processor.masterHandler(this));
		} else {
			process.on("message", Processor.workerHandler(this));
		}
	}

	async startWorkers() {
		if (cluster.isMaster) {
			let readyPromises = [];
			for (let i = 0; i < this.nproc; ++i) {
				readyPromises.push(new Promise(callback => {
					const worker = cluster.fork();
					const ID = worker.id;
					this.workerReadyCallbacks[ID] = callback;
				}));
			}
			await Promise.all(readyPromises);
		}
	}

	addHandler(proto, handler) {
		this.handlers[proto] = handler;
	}

	solveTask(data) {
		const taskIndex = this.queue.findIndex(t => t.id === data.id);
		const task = this.queue.splice(taskIndex, 1)[0];
		if (task && !task.solved) {
			task.solve(data.param);
		}
	}

	static masterHandler(_this) {
		return async (worker, data) => {
			if (data.proto === "solve") {
				_this.solveTask(data);
			} else if (_this.handlers[data.proto]) {
				const handler = _this.handlers[data.proto];
				const ret = await handler(data.param, data.id, worker.id);
				worker.send({
					id: data.id,
					proto: "solve",
					param: ret
				});
			} else {
				log.warn("unknown task", proto);
				worker.send({
					id: data.id,
					proto: "solve",
					param: null
				});
			 }
		};
	}

	static workerHandler(_this) {
		return async (data) => {
			if (data.proto === "solve") {
				_this.solveTask(data);
			} else if (_this.handlers[data.proto]) {
				const handler = _this.handlers[data.proto];
				const ret = await handler(data.param, data.id);
				process.send({
					id: data.id,
					proto: "solve",
					param: ret
				});
			} else {
				log.warn("unknown task", proto);
				process.send({
					id: data.id,
					proto: "solve",
					param: null
				});
			 }
		};
	}

	addTask(proto, param, targetWorker) {
		return new Promise(callback => {
			let worker = null;
			if (cluster.isMaster) {
				if (!targetWorker) {
					targetWorker = Object.keys(cluster.workers)[curID % this.nproc];
				}
				worker = cluster.workers[targetWorker]
			}
			const task = new Task(++curID, proto, param, callback, worker);
			this.queue.push(task);
		});
	}
}
module.exports = Processor;
