var http         = require('http'),
    EventEmitter = require('events').EventEmitter,
    url          = require('url'),
    cheerio      = require('cheerio');
/*
 * Agent
*/
var CrawlAgent = {
    __proto__: EventEmitter.prototype,   // inherit EventEmitter
    _maxLinks: 100,                      // max links to grab / parse 
    _seen: [],                           // internal store for seen pages
    _pending: [],                        // internal store for yet to visit pages
    current: null,                       // current page
    running: false,                      // agent is running
    timeout: 10000,                      // default request timeout
    host: {},                            // host data container see url.parse
    viewed: 0,                           // number of viewed pages
    erred: 0,                            // number of pages errored
    id: null,                            // beanstalk job.id 
    
    init: function (host, links, id) {   // bootup
       this._pending  = links;           // append our links to pending  
       this.host      = url.parse(host); // host data
       this.id        = id;              // beanstalk job.id
       this.current   = host;            // current page to visit 
       
       return this;
    },
    
    visitLink: function() {              // page visiting method 
    
        var self = this; 
         
        var options = url.parse(this.current);   
         
        // the request method
        var req = http.request(options, function(res) {
          var body = "";
          
          // on 'data' = stream incoming
          res.on('data', function(chunk) {
             body += chunk;             
          });
          
          // on 'end' = stream finished sending
          res.on('end', function() {
             options.status = res.statusCode;
             var host_data = {"host": options, "response":res, "body": body};
             
             self.emit('next', null, self, host_data);             
          });
         
        })
        
        // catch any request errors
        req.on('error', function(e) {
           self.erred++;
           self.emit('next', {"crawler": e}, self, null);
        });
        
        // add a socket timeout or hang forever
        req.setTimeout(this.timeout, function(){
           self.erred++;
           self.emit('next', 'timed out', self, null);
           req.destroy();
        });
        
        req.end();        
    },  
    
    // shifts around _pending and _seen (reflecting our crawl)
    getNext: function() {
        if(this._pending.length === 0) {     // if its crawledf 100 pages
            console.log("HIT MAX");          // indicate so
            this.emit('stop');               // and emit a stop 
        } else {
            if(!this.running) {              // setup our running status
              this.running = true;           
            } 
            else 
            {
              // shift from pending to current
              this.current = this._pending.shift();
              
              // prepend our host to it (keeps one sane) 
              if(!/^http/.test(this.current)) {
                this.current = "http://" + this.host.hostname + this.current;
              }
              
              console.log("NEXT"); 
            }
            
            // move current to see (as we are now going to visit it)
            this._seen.push(this.current);
            // and call visit
            this.visitLink();
        }        
    },
    
    // add a new link (if not exists) to _pending
    addLink: function(link) {
       this._pending.push(link);
    },
    
    // ensures we do not have duplicate links
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
    
    // starts the agent crawling
    start: function () {
        this.running = true;
        this.getNext();
    },
    
    // stops the agent and clears it down. send a stop event
    stop: function () {
        this.running = false;
        this.emit('stop');
        this.removeAllListeners();
    },
    
    // simple agent method to kick next
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
     var masters = ['http://www.facebook.com', 'http://www.twitter.com'];     
     
     agent.timeout = 15000;
     agent.setMaxListeners(25);
     
     agent.addListener('next', function(err, worker, data) {
    	 j = 0;
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
        console.log("Agent done, viewed %d, crawled %d, failed on %d", visited_count, crawled, agent.erred);
          agent.removeAllListeners();
          delete agent;        
     });
     
     agent.start();     
  }  
}

var crawler = Crawler.init('http://www.stickyeyes.com', ['/who-we-are/'], 0 /* needs a job id so fake it */ );
