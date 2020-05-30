const _ = global._ = require('underscore');
_.str = require('underscore.string');
_.mixin(_.str.exports());
const bunyan = global.bunyan = require("bunyan");
const log = global.log = bunyan.createLogger({
	name: "srvpro2"
});
const moment = global.moment = require('moment');

moment.updateLocale('zh-cn', {
	relativeTime: {
		future: '%s内',
		past: '%s前',
		s: '%d秒',
		m: '1分钟',
		mm: '%d分钟',
		h: '1小时',
		hh: '%d小时',
		d: '1天',
		dd: '%d天',
		M: '1个月',
		MM: '%d个月',
		y: '1年',
		yy: '%d年'
	}
});

const cluster = require("cluster");
const main = require(`./${cluster.isMaster ? "master" : "worker"}.js`);
main();
