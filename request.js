'use strict;'

var request      = require('request'),
    http         = require('http'),
    url          = require('url'),
    cheerio      = require('cheerio'),
    EventEmitter = require('events').EventEmitter;

var Request = {
    __proto__: EventEmitter.prototype,     // inherits from EventEmitter (just the 1 listener)
    debug: true,                           // debug true for console output
    timeout: 10000,
    masters: ['http://www.twitter.com', 'http://www.facebook.com'],   
 
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
       
                     for (var i in self.masters) {
                          term = self.masters[i];
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


var Req = Request.init();

Req.on('stop', function(err, data) {
    if(!err) {
        console.log("data", data);
    }
    
});

var links = ['http://www.stickyeyes.com', 'http://www.manheim.co.uk']


Req.request('http://www.stickyeyes.com');     

