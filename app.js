'use strict;'

var bs        = require('nodestalker'),
    client    = bs.Client("localhost"),
    tube      = 'seomoz-backlink';


var http = require('http');
var EventEmitter = require('events').EventEmitter;
var url = require('url');
var cheerio = require('cheerio');
var request = require('request');

var masters = ['http://www.bwin.com', 'https://www.bwin.com', 'http://bwin.com', 'https://bwin.com'];
                     
                     

var Request = {
    __proto__: EventEmitter.prototype,     // inherits from EventEmitter (just the 1 listener)
    debug: true,                           // debug true for console output
    timeout: 10000,
    
    init: function () { return this; },
    
     /*
     * Request, sends out initial hit to landing page.
     */
    request: function(host) {
        
       var self     = this,
            options  = { 
                "uri"            : host, 
                "timeout"        : 15000, 
                "maxRedirects"   : 2, 
                "followRedirect" : true 
            },
            internals   = [],
            masters     = [],
            status      = 0,
            redirect    = 0,
            header_info = {},
            status_info = {},
            redirect    = {},
            $           = null;
        
        var page = url.parse(host);   
        
        // See request.js (full fetured http client, used for its follow redirects features)        
        var req = request(options, function (error, res, body) 
        {  
            if(!error) {
                // Redirects found under this.redirects
                if (this.redirects.length > 0) 
                {
                    var re = this.redirects[this.redirects.length-1];
                    status   = re.statusCode;
                    redirect = {"status": re.statusCode, "location":re.redirectUri};      
                    page = url.parse(re.redirectUri);
                } 
                 else 
                {
                    status = res.statusCode;
                    redirect = {"status": 0, "location":0}; 
                }
                
                // Parse our page body (emmits landing metrics)
                if(body) 
                {
                     $ = cheerio.load(body, {lowerCaseTags:true, lowerCaseAttributeNames: true});
                     var hrefs = $('a[href^="http://'+page.host+'"], a[href^="https://'+page.host+'"], a[href^="/"],a[href^="."]').map(function(i, el) {
                        return $(this).attr('href');  
                     }).join('::-::');   

                     internals = hrefs.split('::-::'); 
                
                     internals = internals.filter(function(elem, pos) {
                       return internals.indexOf(elem) == pos;
                     });
                     
                     internals = internals.filter(function(elem, pos) {
                       return !(/^(javascript|mail|#)/).test(pos);
                     });
                     
                     for (var i in masters) {
                          term = masters[i];
                          $("a[href^='" + term + "']").each(function() 
                          {
                              if($(this).attr('href') !== undefined) 
                              {
                                  masters.push({"uri": $(this).attr('href'), "anchor": $(this).html()});  
                              }
                          });                        
                     } 
                }
                
                if(internals.length > 100) {
                    internals = internals.splice(0, 99);
                }
                
                // Emit our results
                if(status && internals) 
                {   
                    var data = {
                       "host"      : host, 
                       "status"    : status, 
                       "redirect"  : redirect,
                       "internals" : internals,
                       "masters"   : masters,
                    };
                    
                    (status < 400) ? self.emit('stop', null, data) : self.emit('stop', {"error": status}, null);
                }   
            } else {
            
               self.emit('stop', {"error": error.code}, null);   
            }
        });

        // Any request errors then fail and move on
        req.on('error', function(error) {
           self.emit('stop', {"error": error}, null);              
        });
    }
};

/*
 * Agent
*/
var CrawlAgent = {
    __proto__: EventEmitter.prototype,
    _maxLinks: 100,
    _seen: [],
    _pending: [],
    current: null,
    running: false,
    timeout: 10000,
    host: {},
    viewed: 0,
    erred: 0,
    id: null,
    
    init: function (host, links, id) {
       this._pending = links;
       this.host = url.parse(host);
       this.id = id;
       this.current = host;
       
       return this;
    },
    
    visitLink: function() {
    
        var self = this; 
         
        var options = url.parse(this.current);   
         
        var req = http.request(options, function(res) {
          var body = "";
          
          res.on('data', function(chunk) {
             body += chunk;             
          });
          
          res.on('end', function() {
             options.status = res.statusCode;
             var host_data = {"host": options, "response":res, "body": body};
             self.emit('next', null, self, host_data);
             
          });
         
        }).on('error', function(e) {
           self.erred++;
           self.emit('next', {"crawler": e}, self, null);
        });
        
        req.setTimeout(this.timeout, function(){
           self.erred++;
           self.emit('next', 'timed out', self, null);
           req.destroy();
        });
        
        req.end();        
    },  
    
    getNext: function() {
        if(this._pending.length === 0) {
            console.log("HIT MAX");
            this.emit('stop');
        } else {
            if(!this.running) {
              this.running = true;
            } else {
              this.current = this._pending.shift();
              
              if(!/^http/.test(this.current)) {
                this.current = "http://" + this.host.hostname + this.current;
              }
              
              console.log("NEXT"); 
            }
            
            this._seen.push(this.current);
            this.visitLink();
        }        
    },
    
    addLink: function(link) {
       this._pending.push(link);
    },
    
    findLink: function(link) {
       for(var l in this._pending) {
          if(this._pending[l] == link)
             return true;
       }
       
       for(var l in this._seen) {
          if(this._seen[l] == link)
             return true;
       }      
    
       return false;
    },
    
    start: function () {
        this.running = true;
        this.getNext();
    },
    
    stop: function () {
        this.running = false;
        this.emit('stop');
        this.removeAllListeners();
    },
    
    next: function () {
      this.getNext();
    }
};

var Crawler = {
  init: function(host, links, id) {
     var agent = CrawlAgent.init(host, links, id);
     var self = this;
     var $=null;
     var internals = [];
     var grab = true;
     var visited_count = 0;
     var crawled = 0;
     var j = 0;
     var matched = 0;
     var maxMatches = 0;
     var errors = 0;
     
     agent.timeout = 15000;
     agent.setMaxListeners(25);
     agent.addListener('next', function(err, worker, data) {
         visited_count++;
         if(id) 
         {
           setInterval(function() {
               client.touch(id);
           }, 45000);
         }   
         
         if(!err) {
            if(grab && agent._pending.length < 100 && internals.length < 100) {
                
                $ = cheerio.load(data.body, {lowerCaseTags:true, lowerCaseAttributeNames: true});
                var hrefs = $('a[href^="http://'+data.host.host+'"], a[href^="https://'+data.host.host+'"], a[href^="/"],a[href^="."]').map(function(i, el) {
                     return $(this).attr('href');  
                 }).join('::-::');   

                internals = hrefs.split('::-::'); 
                
                internals = internals.filter(function(elem, pos) {
                   return internals.indexOf(elem) == pos;
                });
                
                internals = internals.filter(function(elem, pos) {
                   return !(/(pdf|gif|png|jpg|doc|mov|avi|mpg)$/).test(pos);
                });                

                //internals = (internals.length > 100) ? internals.splice(0, 99) : internals;
                for (var i in internals) {
                    if( !agent.findLink(internals[i]) ) {
                       if(agent._pending.length < 100) {
                         agent.addLink(internals[i]);
                       }
                    }
                } 
                
                for (var i in masters) {
                   term = masters[i];
                   $("a[href^='" + term + "']").each(function() 
                   {
                      if($(this).attr('href') !== undefined) 
                      {
                          j++;
                          matched++;
                      }
                  });                        
               }     
               
                maxMatches = (j > maxMatches) ? j : maxMatches; 
                          
            }  else {
               grab = false;
            }
           
            errors = 0;
           
            if(agent._pending.length + visited_count >= 100) {
              grab = false;
              crawled = agent._pending.length;  
            }  
            console.log("STATUS", data.host);
            console.log("Page: %d %s, grab: %s, matched: %d, max matches: %d", agent._pending.length, agent.current, grab, matched, maxMatches);
                      
            data.host.internals = internals.length; 
            
            //console.log("host ", data.host);
            internals = [];
            $ = null;
         } else {
            errors++;
            console.log("crawler err", err);   
            if(errors >= 2) {
              worker.stop();
            }
         }
         
         worker.next();
     }); 

     agent.addListener('stop', function() {
        console.log("Agent done, viewed %d, failed on %d", visited_count, crawled, agent.erred);
        
        visited_count = 0;
        
        client.deleteJob(id).onSuccess(function(del_msg) {
          console.log('AGENT STOP', del_msg);
          resJob();
          
          agent.removeAllListeners();
          delete agent;
        });
     });
     
     agent.start();     
  }  
}

var worker = { 
    init: function (job) {
    
      var agent = null
    
      var request = Object.create(Request).init();
      try{  
        request.addListener('stop', function (err, res) {
           if(!err) {
              var host = (res.status > 200) ? res.redirect.location : job.data;
              
              if(!res.internals.length > 0) {
                res.internals[0] = url.parse(job.data).host;
              }
              
              agent = Object.create(Crawler).init(job.data, res.internals, job.id);
              
              delete request;              
           } else {
              console.log("Worker err", err);
              delJob(job.id);
              delete request;                            
           }
        });
        
        request.request(job.data);
    } catch(e) {
       console.log(e);
    }    
  }
}

function delJob(id) {
   console.log("Del job", id);	
   client.deleteJob(id).onSuccess(function(del_msg) {
     console.log("WORKER", del_msg);
   });
   resJob();
}

function resJob() {
 console.log(1);
 
 var kick = setTimeout(function() {
	 console.log("Idle bastard gets kicked and ...");
	 resJob();
 }, 15000); 

 client.reserve().onSuccess(function(job) {
    console.log(2);
    if(job && !(/(pdf|gif|png|jpg|doc|mov|avi|mpg)$/).test(job.data)) {
        client.stats_job(job.id).onSuccess(function(stats) {
           console.log("job stats", stats);	
     	   if(stats.reserves >= 10) {
                client.deleteJob(job.id).onSuccess(function(del_msg) {
                     console.log('deleted %d as its been reserved and thus failed 10 times', job.id);
                     console.log('message', del_msg);
                     delJob(job.id);
                });         		   
     	   } else {
     		  clearTimeout(kick);
     		  console.log("Running", job.data);
     	      worker.init(job);     		  
     	   }
        });
        
    	
       
    
    } else 
    {
    	delJob(job.id);
    }
 });
}

client.watch(tube).onSuccess(function(data) {
  console.log(data);
  resJob();
});  
