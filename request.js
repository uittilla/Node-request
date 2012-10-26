'use strict;'

var request      = require('request'),
    http         = require('http'),
    url          = require('url'),
    cheerio      = require('cheerio'),
    EventEmitter = require('events').EventEmitter;

var Request = {
    __proto__: EventEmitter.prototype,     // inherits from EventEmitter (just the 1 listener)
    debug: true,                           // debug true for console output
    timeout: 10000,                        // defaukt request timeout   
    masters: ['http://www.twitter.com', 'http://www.facebook.com'],  // master backlinks to match up 
 
    init: function () { return this; },
    
     /*
     * Request, sends out initial hit to landing page.
     */
    request: function(host) {
        
       var self     = this,                   // maps to ourself
            options  = {                      // options for the request
                "uri"            : host,      // hostname to visit
                "timeout"        : 15000,     // initial timeout
                "maxRedirects"   : 2,         // max redirects allowed
                "followRedirect" : true       // follow the redirects (if any) 
            },
            internals   = [],                 // internal links container
            masters     = [],                 // master backlinks container
            header_info = {},                 // page headers
            status_info = {},                 // page staus  
            status      = 0,                  // page response status  
            redirect    = {},                 // redirect container
            $           = null;               // maps to cheerio (jQuery on the server)  
        
        var page = url.parse(host);           // url.parse is a handy feature (splits a url into its component parts)   
        
        // See request.js (full fetured http client, used for its follow redirects features)        
        var req = request(options, function (error, res, body) 
        {  
            if(!error) {
                // Redirects found under this.redirects
                if (this.redirects.length > 0) 
                {
                    // build our redirect info
                    var re = this.redirects[this.redirects.length-1];
                    status   = re.statusCode;
                    redirect = {"status": re.statusCode, "location":re.redirectUri};      
                    page = url.parse(re.redirectUri);
                } 
                 else 
                {   // default status if no redirect
                    status = res.statusCode;
                    redirect = {"status": 0, "location":0}; 
                }
                
                // Parse our page body (emmits landing metrics)
                if(body) 
                {    // load the body into cheerio (jQuery on the server)
                     $ = cheerio.load(body, {lowerCaseTags:true, lowerCaseAttributeNames: true});

                     // map appears to have a better time than doing a 
                     // $('a').each()
                     var hrefs = $('a[href^="http://'+page.host+'"], a[href^="https://'+page.host+'"], a[href^="/"],a[href^="."]').map(function(i, el) {
                        return $(this).attr('href');  
                     }).join('::-::');   

                     internals = hrefs.split('::-::'); 
                     
                     // remove duplicates
                     internals = internals.filter(function(elem, pos) {
                       return internals.indexOf(elem) == pos;
                     });
                     
                     // remove undersired links
                     internals = internals.filter(function(elem, pos) {
                       return !(/^(javascript|mail|#)/).test(pos);
                     });
       
                     // grab any urls matching our mater backlinks 
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
                
                // we only want a hundred
                if(internals.length > 100) {
                    internals = internals.splice(0, 99);
                }
                
                // Emit our results
                if(status && internals) 
                {   
                    var data = {                     // build up our output (json please)
                       "host"      : host,           // hostname 
                       "status"    : status,         // status
                       "redirect"  : redirect,       // redirect info
                       "internals" : internals,      // internal links
                       "masters"   : masters,        // master backlinks found
                    };
                    
                    // status < 400 success || error
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

// As we inherited eventemmiter we can simply call Req.on
// This simply sits tight and waits for a stop event to fire
Req.on('stop', function(err, data) {
    if(!err) {
        console.log("data", data);
    }
    
});

// add your own here and loop over Req.request(host)
// And watch your results turn up
var links = ['http://www.stickyeyes.com', 'http://www.manheim.co.uk']

Req.request('http://www.stickyeyes.com');     

