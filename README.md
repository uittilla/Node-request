First things first.

#1 Creat a folder and put your script inside of it.
#2 install node and npm (windows users will have to find out themselves while debian style users can find nodeJS in the repo's along with npm) apt-get install nodeJs npm g++

Once you have done the basic setup you should have access to > node, try running it an npm to be sure all is fine.

If all is good cd into the working folder and run "npm install" this should sort out your dependancies. However if I missed something it will complain about it.

In this case in the working folder just run "npm install <missing module>"

These scripts are intended for demostration of how this stuff works. They can also provide a starting point for other ideas that involve scraping websites.  (like twitter and facebook style stuff (likes and tweets etc)

Know ISSUES:

Some webpages are just impossible and cannot be crawled. Catching these errors has been handled but there are that many websites and that many pages and that many errors that its impossible to envisage them all.

Scripts:

app.js

A combination of both request and crawler .js

request.js

This app simply take a url and visits it. While doing this it collects a number of things of importance.

#1 Any internal links found on the page
#2 Any master backlink matches found on the page

crawler.js

This app takes a given url and set of internal link (if any) and proceed to visit each on in turn.
During these visits the app determines if it has 100 pages to visit and makes efforts to find 100 links of not. The app also collates a number of website metrics that are usefull.

Tally up the following.

#1 Total number of master backlink matches found
#2 maximum number of backlinks found on any page visited (page is no important)

