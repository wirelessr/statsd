/*jshint node:true, laxcomma:true */

var util = require('util');
var GoogleSpreadsheet = require('google-spreadsheet');
var doc = new GoogleSpreadsheet(process.env.GOOGLE_URL_ID);
var records;
var async = require('async');
var HEADER = ['name', 'count'];

function setAuth(step) {
    var creds_json = {
        client_email: process.env.GOOGLE_ACCT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY
    }

    doc.useServiceAccountAuth(creds_json, step);
}

function GoogleSpreadBackend(startupTime, config, emitter){
  var self = this;
  this.lastFlush = startupTime;
  this.lastException = startupTime;
  this.config = config.console || {};

  // attach
  emitter.on('flush', function(timestamp, metrics) { self.flush(timestamp, metrics); });
  emitter.on('status', function(callback) { self.status(callback); });
}

GoogleSpreadBackend.prototype.flush = function(timestamp, metrics) {
  console.log('Flushing stats at ', new Date(timestamp * 1000).toString());
  var counters = JSON.parse(JSON.stringify(metrics.counters));

    async.series([
        setAuth,
        function _getWorksheet(step) {
            doc.getInfo(function(err, info) {
                records = info.worksheets.find(function(element) {
                    return element.title == 'Counters';
                });
                step();
            });
        },
        function _checkWorksheet(step) {
            if(!records) {
                doc.addWorksheet({
                    title: 'Counters',
                    headers: HEADER
                }, function(err, sheet){
                    records = sheet;
                    step();
                });
            } else {
                step();
            }
        },
        function _create(step) {
			for(var x in counters) {
				if(!x.startsWith('statsd')) {
					records.getRows({'name': x}, (err, rows) => {
						if(rows.length == 0) {
							var data = {};
							data['name'] = x;
							data['count'] = counters[x];
							records.addRow(data, ()=>{});
						} else if(rows.length != 1) {
							throw 'Duplicated name: '+x;
						} else {
							var row = rows[0];
							row.count = parseInt(row.count) + parseInt(counters[x]);
							row.save();
						}
					});
				}
			}
			step();
        }
    ], function(err) {
        if(err) {
            console.log(err);
        }
    });


};

GoogleSpreadBackend.prototype.status = function(write) {
  ['lastFlush', 'lastException'].forEach(function(key) {
    write(null, 'console', key, this[key]);
  }, this);
};

exports.init = function(startupTime, config, events) {
  var instance = new GoogleSpreadBackend(startupTime, config, events);
  return true;
};
