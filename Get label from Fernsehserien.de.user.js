// ==UserScript==
// @name         Get label from Fernsehserien.de
// @namespace    https://greasyfork.org/users/21515
// @version      0.2.1
// @description  Offer Fernsehserien.de label based on episode number or title as Wikidata label
// @author       CennoxX
// @contact      cesar.bernard@gmx.de
// @homepage     https://twitter.com/CennoxX
// @match        https://www.wikidata.org/wiki/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=wikidata.org
// @grant        GM.xmlHttpRequest
// ==/UserScript==
/* jshint esversion: 6 */
/* eslint quotes: ["warn", "double", "avoid-escape"]*/
/* eslint curly: "off"*/
/* globals jQuery, $, mw */

(function(){
    "use strict";
    var correct = false;
    var added = false;
    var itemId = mw.config.get("wbEntityId");
    if (!itemId){
        return;
    }
    function compareString(title){
        return title.trim().toLowerCase().replace(/\(?(?:part)? ?(\d+?)\)?$/i, "$1").replace(/&/i, "and").replace(/^the |^a |[\u200B-\u200D\uFEFF]| |\.|'|’|\(|\)|:|,|‚|\?|!|„|“|"|‘|…|\.|—|–|-/gi,"");
    }
    async function checkTitle(ep, oldTitle, tryByNumber){
        var titles = [...ep.querySelectorAll("div:nth-child(7)>span")].map(i => i.innerText);
        var german = titles[0].replace(/ \((\d+)\)$/," – Teil $1").replace(/, Teil (\d+)$/," – Teil $1").replace(/ \(Teil (\d+)\)$/," – Teil $1");
        var english = titles[1];
        var deLabel = null;

        var insertElem = '<span class="wikibase-entitytermsview-aliases-alias"> ' +
            '<a class="wb-item-delabel" href="" title="Approve this label for German"></a> <span title="de" style="color:#72777d"></span></span>';
        var deLabelsDiv = $("div.wikibase-entitytermsview-labels");
        deLabelsDiv.append(insertElem);
        deLabelsDiv.find(".wb-item-delabel").click(submitDeLabel);
        return await new Promise(resolve => {
            var stopInterval = setInterval(()=>{
                if (deLabel != null){
                    if (german != "–" || [...document.querySelectorAll(".wb-item-delabel")].filter(i => i.innerText=="–").length==0){
                        var descr = deLabel.nextElementSibling;
                        descr.innerText = `(${english})`;
                        var titleA = compareString(oldTitle);
                        var titleB = compareString(english);
                        correct = titleA == titleB && german != "–";
                        if (!correct && !tryByNumber && german != "–" && (titleA==titleB.replace(/\d/g,"") || titleB==titleA.replace(/\d/g,""))){
                            german = german.split(" – Teil ")[0];
                            correct = true;
                        }
                        deLabel.innerText = german;
                        var color = "";
                        if (tryByNumber && correct)
                            color = "lightgreen";
                        else if (!tryByNumber && correct)
                            color = "lightyellow";
                        else
                            color = "lightpink";
                        descr.style.backgroundColor = color;
                    }
                    clearInterval(stopInterval);
                    resolve(correct);
                }
                var deLabels = document.querySelectorAll(".wb-item-delabel");
                deLabel = deLabels[deLabels.length-1];
            },500);
        });
    }
    function getByTitle(ep, oldTitle, html, tryByTitle){
        var originalTitle = [...html.querySelectorAll(".episodenliste-schmal")].filter(i => {
            var titleA = compareString(i.innerText);
            var titleB = compareString(oldTitle);
            if (tryByTitle)
                return titleA == titleB;
            else
                return titleA.replace(/\d/g,"") == titleB.replace(/\d/g,"");
        });
        if (originalTitle.length>0)
            ep = originalTitle[0].closest("a");
        return ep;
    }
    function getByLevenshteinDistance(ep, oldTitle, html){
        var distMap = [...html.querySelectorAll(".episodenliste-schmal")].map(i => {
            var titleA = compareString(i.innerText);
            var titleB = compareString(oldTitle);
            var dist = levenshteinDistance(titleA,titleB);
            return({ep:i,dist});
        });
        var minDist = distMap.reduce(function(prev, curr) {
            return prev.dist < curr.dist ? prev : curr;
        });
        console.log("levenshtein distance:",minDist.dist);
        return minDist.ep.closest("a");
    }
    function levenshteinDistance(str1, str2){
        var track = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));
        for (let i = 0; i <= str1.length; i += 1) {
            track[0][i] = i;
        }
        for (let j = 0; j <= str2.length; j += 1) {
            track[j][0] = j;
        }
        for (let j = 1; j <= str2.length; j += 1) {
            for (let i = 1; i <= str1.length; i += 1) {
                var indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
                track[j][i] = Math.min(
                    track[j][i - 1] + 1,
                    track[j - 1][i] + 1,
                    track[j - 1][i - 1] + indicator,
                );
            }
        }
        return track[str2.length][str1.length];
    }
    var mainLoop = setInterval(async()=>{
        if (typeof $ != "undefined") {
            if (document.querySelector(".wikibase-labelview-text").innerText=="Keine Bezeichnung vorhanden"){
                var oldTitle = document.querySelector(".wikibase-title-label span")?.innerText;
                //todo: get labels from languages that are not fallback
                if (oldTitle != null){
                    clearInterval(mainLoop);
                    var season = document.querySelector('[data-property-id="P4908"] .wikibase-snakview-value')?.innerText.split("/Staffel ").pop();
                    var episode = document.querySelector('[data-property-id="P4908"] [href="/wiki/Property:P1545"]')?.closest(".wikibase-snakview").querySelector(".wikibase-snakview-value").innerText;
                    var episodeNumber = "";
                    if (episode != null)
                        episodeNumber = season+"x"+(episode[1]?"":"0")+episode;
                    var series = document.querySelector('[data-property-id="P179"] .wikibase-snakview-value a').href.split("/")[4];
                    var response = await fetch(`https://query.wikidata.org/sparql?query=SELECT%20*%20WHERE%20%7B%0A%20%20wd%3A${series}%20wdt%3AP5327%20%3Fid.%0A%7D&format=json`);
                    var data = await response.json();
                    var fsid = data.results.bindings[0].id.value;
                    var epGuide = `https://www.fernsehserien.de/${fsid}/episodenguide`;

                    //console.clear();
                    var result = await GM.xmlHttpRequest({
                        method: "GET",
                        url: epGuide,
                        onload: function(response) {
                            return response;
                        }
                    });
                    var html=document.createElement("div");
                    html.innerHTML = result.responseText;
                    fsid = html.querySelector('meta[property="og:url"]').content.split("/")[3];
                    var ep = null;

                    var deLabelsParent = $("#wb-item-" + itemId + " div.wikibase-entitytermsview-heading");
                    var deLabelsDOM = $('<div class="wikibase-entitytermsview-heading-labels">Bezeichnungen von <a id="fsLink" href="'+epGuide+'">Fernsehserien.de</a>:</div>');
                    var deLabelsDiv = $('<div class="wikibase-entitytermsview-labels"></div>');
                    deLabelsDOM.append(deLabelsDiv);
                    deLabelsParent.prepend(deLabelsDOM);
                    if (episode){
                        console.log("try by episode number");
                        ep = html.querySelector(`a[href^='/${fsid}/folgen/${episodeNumber}']`);
                        if (ep)
                        {
                            correct = await checkTitle(ep, oldTitle, true);
                        }
                    }
                    if (!correct){
                        console.log("try by title, with matching numbers");
                        ep = getByTitle(ep, oldTitle, html, true);
                        if (ep)
                        {
                            correct = await checkTitle(ep, oldTitle, false);
                        }
                    }
                    if (!correct){
                        console.log("try by title, without matching numbers");
                        ep = getByTitle(ep, oldTitle, html, false);
                        if (ep){
                            correct = await checkTitle(ep, oldTitle, false)
                        }
                    }
                    if (!correct){
                        console.log("get episode by levenshtein distance of title")
                        ep = getByLevenshteinDistance(ep, oldTitle, html);
                        if (ep){
                            correct = await checkTitle(ep, oldTitle, false)
                        }
                    }

                }
            }
        }
    },100);

    function submitDeLabel(ev) {
        ev.preventDefault();
        var selectedLabel = $(ev.target).text();
        console.log("selected de label: " + selectedLabel);

        var labels = {};
        labels.de = {
            "language": "de",
            "value": selectedLabel
        };
        setItem(JSON.stringify( {
            "labels": labels,
        } ), "[de] " + selectedLabel);
    }

    function setItem( item, summary ) {
        $.ajax( {
            type: "POST",
            url: mw.util.wikiScript("api"),
            data: {
                format: "json",
                action: "wbeditentity",
                id: itemId,
                type: "item",
                token: mw.user.tokens.get( "csrfToken" ),
                data: item,
                summary: "Get Label from Fernsehserien.de: " + summary,
                exclude: "pageid|ns|title|lastrevid|touched|sitelinks"
            }
        } )
            .done( function ( data ) {
            if ( data.hasOwnProperty( "error" ) ) {
                mw.notify( "API Error" + JSON.stringify( data ), { title: "add label", tag: "fs" } );
                $( "#green-box" ).empty();
                $( "#red-box" ).empty();
                $( "#red-box" ).append( data.error.info.replace( /\n/g, " " ) );
            } else {
                $( "#green-box" ).empty();
                $( "#green-box" ).append( summary );
                mw.notify("sent", { title: "add label", tag: "fs" } );
                window.location.reload(true);
            }
        } )
            .fail( function () {
            mw.notify( "API Error", { title: "add label", tag: "fs" } );
            $( "#green-box" ).empty();
            $( "#red-box" ).empty();
            $( "#red-box" ).append( "API Error" );
        } );
    }
})();