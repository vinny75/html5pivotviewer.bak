//
//  HTML5 PivotViewer
//
//  Original Code:
//    Copyright (C) 2011 LobsterPot Solutions - http://www.lobsterpot.com.au/
//    enquiries@lobsterpot.com.au
//
//  Enhancements:
//    Copyright (C) 2012-2014 OpenLink Software - http://www.openlinksw.com/
//
//  This software is licensed under the terms of the
//  GNU General Public License v2 (see COPYING)
//

///  Collection loader interface - used so that different types of data sources can be used
PivotViewer.Models.Loaders.ICollectionLoader = Object.subClass({
    init: function () { },
    LoadCollection: function (collection) {
        if (!collection instanceof PivotViewer.Models.Collection) {
            throw "collection not an instance of PivotViewer.Models.Collection.";
        }
    }
});

//CXML loader
PivotViewer.Models.Loaders.CXMLLoader = PivotViewer.Models.Loaders.ICollectionLoader.subClass({
    init: function (CXMLUri, proxy) {
        this.CXMLUriNoProxy = CXMLUri;
        if (proxy)
            this.CXMLUri = proxy + CXMLUri;
        else 
            this.CXMLUri = CXMLUri;
    },
    LoadCollection: function (collection) {
        var collection = collection;
        this._super(collection);

        collection.CXMLBaseNoProxy = this.CXMLUriNoProxy;
        collection.CXMLBase = this.CXMLUri;

        $.ajax({
            type: "GET",
            url: this.CXMLUri,
            dataType: "xml",
            success: function (xml) {
                Debug.Log('CXML loaded');
                var collectionRoot = $(xml).find("Collection")[0];
                var maxRelatedLinksLength = 0;
                //get namespace local name
                var namespacePrefix = "P";

                if (collectionRoot == undefined) {
                    //Make sure throbber is removed else everyone thinks the app is still running
                    $('.pv-loading').remove();
 
                    //Display message so the user knows something is wrong
                    var msg = '';
                    msg = msg + 'Error parsing CXML Collection<br>';
                    msg = msg + '<br>Pivot Viewer cannot continue until this problem is resolved<br>';
					PivotViewer.Utils.ModalDialog(msg);
                    throw "Error parsing CXML Collection";
                }

                for (var i = 0; i < collectionRoot.attributes.length; i++) {
                    if (collectionRoot.attributes[i].value == "http://schemas.microsoft.com/livelabs/pivot/collection/2009") {
                        namespacePrefix = collectionRoot.attributes[i].localName != undefined ? collectionRoot.attributes[i].localName : collectionRoot.attributes[i].baseName;
                        break;
                    }
                }
                collection.CollectionName = $(collectionRoot).attr("Name");
                collection.BrandImage = $(collectionRoot).attr(namespacePrefix + ":BrandImage") != undefined ? $(collectionRoot).attr(namespacePrefix + ":BrandImage") : "";

                //FacetCategory
                var facetCategories = $(xml).find("FacetCategory");
                savedNamespacePrefix = namespacePrefix;
                for (var i = 0; i < facetCategories.length; i++) {
                    var facetElement = $(facetCategories[i]);

                    // Handle locally defined namespaces
                    for (var j = 0; j < facetElement[0].attributes.length; j++) {
                        if (facetElement[0].attributes[j].value == "http://schemas.microsoft.com/livelabs/pivot/collection/2009") {
                            namespacePrefix = facetElement[0].attributes[j].localName != undefined ? facetElement[0].attributes[j].localName : facetElement[0].attributes[j].baseName;
                            break;
                        }
                    }

                    var facetCategory = new PivotViewer.Models.FacetCategory(
                    facetElement.attr("Name"),
                        facetElement.attr("Format"),
                        facetElement.attr("Type"),
                        facetElement.attr(namespacePrefix + ":IsFilterVisible") != undefined ? (facetElement.attr(namespacePrefix + ":IsFilterVisible").toLowerCase() == "true" ? true : false) : true,
                        facetElement.attr(namespacePrefix + ":IsMetaDataVisible") != undefined ? (facetElement.attr(namespacePrefix + ":IsMetaDataVisible").toLowerCase() == "true" ? true : false) : true,
                        facetElement.attr(namespacePrefix + ":IsWordWheelVisible") != undefined ? (facetElement.attr(namespacePrefix + ":IsWordWheelVisible").toLowerCase() == "true" ? true : false) : true
                        );

                    //Add custom sort order
                    var sortOrder = facetElement.find(namespacePrefix + "\\:SortOrder");
                    var sortValues = sortOrder.find(namespacePrefix + "\\:SortValue");

                    if (sortOrder.length == 0) {
                        //webkit doesn't seem to like the P namespace
                        sortOrder = facetElement.find("SortOrder");
                        sortValues = sortOrder.find("SortValue");
                    }

                    if (sortOrder.length == 1) {
                        var customSort = new PivotViewer.Models.FacetCategorySort(sortOrder.attr("Name"));
                        for (var j = 0; j < sortValues.length; j++) {
                            customSort.SortValues.push($(sortValues[j]).attr("Value"));
                        }
                        facetCategory.CustomSort = customSort;
                    }
                    collection.FacetCategories.push(facetCategory);
                    namespacePrefix = savedNamespacePrefix;
                }
                //Items
                var facetItems = $(xml).find("Items");
                if (facetItems.length == 1) {
                    collection.ImageBase = $(facetItems[0]).attr("ImgBase");
                    var facetItem = $(facetItems[0]).find("Item");
                    if (facetItem.length == 0) {
                        //Make sure throbber is removed else everyone thinks the app is still running
                        $('.pv-loading').remove();
 
                        //Display a message so the user knows something is wrong
                        var msg = '';
                        msg = msg + 'There are no items in the CXML Collection<br><br>';
						PivotViewer.Utils.ModalDialog(msg);
                    } else {
                        for (var i = 0; i < facetItem.length; i++) {
                            var item = new PivotViewer.Models.Item(
                                $(facetItem[i]).attr("Img").replace("#", ""),
                                $(facetItem[i]).attr("Id"),
                                $(facetItem[i]).attr("Href"),
                                $(facetItem[i]).attr("Name")
                            );
                            var description = $(facetItem[i]).find("Description");
                            if (description.length == 1 && description[0].childNodes.length)
                                item.Description = PivotViewer.Utils.HtmlSpecialChars(description[0].childNodes[0].nodeValue);
                            var facets = $(facetItem[i]).find("Facet");
                            for (var j = 0; j < facets.length; j++) {
                                var f = new PivotViewer.Models.Facet(
                                    $(facets[j]).attr("Name")
                                );
               
                                var facetChildren = $(facets[j]).children();
                                for (var k = 0; k < facetChildren.length; k++) {
                                    if (facetChildren[k].nodeType == 1) {
                                        var v = $.trim($(facetChildren[k]).attr("Value"));
                                        if (v == null || v == "") {
                                            if (facetChildren[k].nodeName == "Link") {
                                                if ($(facetChildren[k]).attr("Href") == "" || $(facetChildren[k]).attr("Href") == null) {
                                                   var fValue = new PivotViewer.Models.FacetValue(PivotViewer.Utils.HtmlSpecialChars("(empty Link)"));
                                                   f.AddFacetValue(fValue);
                                              
                                                } else if ($(facetChildren[k]).attr("Name") == "" || $(facetChildren[k]).attr("Name") == null) {
                                                    var fValue = new PivotViewer.Models.FacetValue("(unnamed Link)");
                                                    fValue.Href = $(facetChildren[k]).attr("Href");
                                                    f.AddFacetValue(fValue);
                                                } else { 
                                                    var fValue = new PivotViewer.Models.FacetValue($(facetChildren[k]).attr("Name"));
                                                    fValue.Href = $(facetChildren[k]).attr("Href");
                                                    f.AddFacetValue(fValue);
                                                } 
                                            } else { 
                                                var fValue = new PivotViewer.Models.FacetValue(PivotViewer.Utils.HtmlSpecialChars("(empty " + facetChildren[k].nodeName + ")"));
                                                f.AddFacetValue(fValue);
                                            }
                                        } else {
                                            //convert strings to numbers so histogram can work
                                            if (facetChildren[k].nodeName == "Number") {
                                                var fValue = new PivotViewer.Models.FacetValue(parseFloat(v));
                                                f.AddFacetValue(fValue);
                                            } else {
                                                var fValue = new PivotViewer.Models.FacetValue(PivotViewer.Utils.HtmlSpecialChars(v));
                                                f.AddFacetValue(fValue);
                                            }
                                        }
                                    }
                                }
                                item.Facets.push(f);
                            }
                            var itemExtension = $(facetItem[i]).find("Extension");
                            if (itemExtension.length == 1) {
                                var savedNamespacePrefix = namespacePrefix;
                    
                                // Handle locally defined namespaces
                                for (var j = 0; j < itemExtension[0].children.length; j++) {
                                    namespacePrefix = itemExtension[0].children[0].lookupPrefix("http://schemas.microsoft.com/livelabs/pivot/collection/2009");
                                    if (namespacePrefix)
                                        break;
                                }

                                //var itemRelated = $(itemExtension[0]).find('d1p1\\:Related, Related');
                                var itemRelated = $(itemExtension[0]).find(namespacePrefix + '\\:Related, Related');
                                if (itemRelated.length == 1) {
                                    var links = $(itemRelated[0]).find(namespacePrefix + '\\:Link, Link');
                                    for (var l = 0; l < links.length; l++) {
                                        var linkName = $(links[l]).attr("Name"); 
                                        var linkHref = $(links[l]).attr("Href"); 
                                        if (linkHref.indexOf(".cxml") == -1 && 
                                            linkHref.indexOf("pivot.vsp") >= 0) {
                                                var url = $.url(this.url);
                                                linkHref = url.attr('protocol') + "://" + url.attr('authority') + url.attr('directory') + linkHref;
                                        }
                                        var link = new PivotViewer.Models.ItemLink(linkName, linkHref);
                                        item.Links.push(link);
                                    }
                                    if (links.length > maxRelatedLinksLength)
                                       maxRelatedLinksLength = links.length;
                                }
                                namespacePrefix = savedNamespacePrefix;
                            }
                            collection.Items.push(item);
                        }
                    }
                }
                collection.MaxRelatedLinks = maxRelatedLinksLength;
                //Extensions
                var extension = $(xml).find("Extension");
                if (extension.length > 1) {
                    for (x = 0; x < extension.length; x++) {
                        var savedNamespacePrefix = namespacePrefix;
                    
                        // Handle locally defined namespaces
                        for (var j = 0; j < extension[x].children.length; j++) {
                            namespacePrefix = extension[0].children[0].lookupPrefix("http://schemas.microsoft.com/livelabs/pivot/collection/2009");
                            if (namespacePrefix)
                                break;
                        }

                        //var collectionCopyright = $(extension[x]).find('d1p1\\:Copyright, Copyright');
                        var collectionCopyright = $(extension[x]).find(namespacePrefix + '\\:Copyright, Copyright');
                        if (collectionCopyright.length > 0) { 
                            collection.CopyrightName = $(collectionCopyright[0]).attr("Name");
                            collection.CopyrightHref = $(collectionCopyright[0]).attr("Href");
                            break;
                        }
                        namespacePrefix = savedNamespacePrefix;
                    }
                }

                $.publish("/PivotViewer/Models/Collection/Loaded", null);
            },
            error: function (jqXHR, textStatus, errorThrown) {
                //Make sure throbber is removed else everyone thinks the app is still running
                $('.pv-loading').remove();

                //Display a message so the user knows something is wrong
                var msg = '';
                msg = msg + 'Error loading CXML Collection<br><br>';
                msg = msg + 'URL        : ' + this.url + '<br>';
                msg = msg + 'Status : ' + jqXHR.status + ' ' + errorThrown + '<br>';
                msg = msg + 'Details    : ' + jqXHR.responseText + '<br>';
                msg = msg + '<br>Pivot Viewer cannot continue until this problem is resolved<br>';
				PivotViewer.Utils.ModalDialog(msg);
            }
        });
    }
});
