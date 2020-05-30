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

class Processor { 
	constructor(nproc) { 
		this.queue = [];
		this.handlers = {};
		this.nproc = nproc;
		if (cluster.isMaster) {
			for (let i = 1; i < nproc; ++i) { 
				cluster.fork();
			}
			cluster.on("message", this.masterHandler);
		} else { 
			process.on("message", this.workerHandler);
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

	async masterHandler(worker, data) { 
		if (data.proto === "solve") {
			solveTask(data);
		} else if(this.handlers[data.proto]) {
			const handler = this.handlers[data.proto];
			const ret = await handler(data.param);
			worker.send({
				id: data.id,
				proto: "solve",
				param: ret
			});
		 }
	}

	async workerHandler(data) { 
		if (data.proto === "solve") {
			solveTask(data);
		} else if(this.handlers[data.proto]) {
			const handler = this.handlers[data.proto];
			const ret = await handler(data.param);
			process.send({
				id: data.id,
				proto: "solve",
				param: ret
			});
		 }
	}

	addTask(proto, param, targetWorker) { 
		return new Promise(callback => {
			if (!targetWorker) { 
				targetWorker = curID % this.nproc;
			}
			const worker = cluster.workers[targetWorker];
			const task = new Task(++curID, proto, param, callback, worker);
			this.queue.push(task);
		});
	}
}
module.exports = Processor;
