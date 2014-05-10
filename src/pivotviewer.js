//
//  HTML5 PivotViewer
//
//  Collection loader interface - used so that different types of data sources can be used
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

///PivotViewer jQuery extension
(function ($) {
    var _views = [],
        _facetItemTotals = [], //used to store the counts of all the string facets - used when resetting the filters
        _facetNumericItemTotals = [], //used to store the counts of all the numeric facets - used when resetting the filters
        _facetDateTimeItemTotals = [], //used to store the counts of all the datetime facets - used when resetting the filters
        _wordWheelItems = [], //used for quick access to search values
	_stringFacets = [],
	_numericFacets = [],
	_datetimeFacets = [],
        _currentView = 0,
        _loadingInterval,
        _tileController,
        _tiles = [],
        _filterItems = [],
        _selectedItem = "",
        _selectedItemBkt = 0,
        _initSelectedItem = "",
        _initTableFacet = "",
        _handledInitSettings = false,
        _changeToTileViewSelectedItem = "",
        _currentSort = "",
        _imageController,
        _mouseDrag = null,
        _mouseMove = null,
        _viewerState = { View: null, Facet: null, Filters: [] },
        _self = null,
        _nameMapping = {},
        _googleAPILoaded = false,
        _googleAPIKey,
        PivotCollection = new PivotViewer.Models.Collection();

    var methods = {
        // PivotViewer can be initialised with these options:
        // Loader: a loader that inherits from ICollectionLoader must be specified.  Currently the project only includes the CXMLLoader.  It takes the URL of the collection as a parameter.
        // ImageController: defaults to the DeepZoom image controller.
        // ViewerState: Sets the filters, selected item and chosen view when the PivotViewer first opens
        // GoogleAPIKey: required to use the map view. 
        init: function (options) {
            _self = this;
            _self.addClass('pv-wrapper');
			_self.height(window.innerHeight-2); // FIXME Hack to get full height get/set BODY margin/padding
            InitPreloader();

            //Collection loader
            if (options.Loader == undefined)
                throw "Collection loader is undefined.";
            if (options.Loader instanceof PivotViewer.Models.Loaders.ICollectionLoader)
                options.Loader.LoadCollection(PivotCollection);
            else
                throw "Collection loader does not inherit from PivotViewer.Models.Loaders.ICollectionLoader.";

            //Image controller
            if (options.ImageController == undefined)
                _imageController = new PivotViewer.Views.DeepZoomImageController();
            else if (!options.ImageController instanceof PivotViewer.Views.IImageController)
                throw "Image Controller does not inherit from PivotViewer.Views.IImageController.";
            else
                _imageController = options.ImageController;

            //Google map key
            if (options.GoogleAPIKey != undefined)
               _googleAPIKey = options.GoogleAPIKey;

            //ViewerState
            //http://i2.silverlight.net/content/pivotviewer/developer-info/api/html/P_System_Windows_Pivot_PivotViewer_ViewerState.htm
            if (options.ViewerState != undefined) {
                var splitVS = options.ViewerState.split('&');
                for (var i = 0, _iLen = splitVS.length; i < _iLen; i++) {
                    var splitItem = splitVS[i].split('=');
                    if (splitItem.length == 2) {
                        //Selected view
                        if (splitItem[0] == '$view$')
                            _viewerState.View = parseInt(splitItem[1]) - 1;
                        //Sorted by
                        else if (splitItem[0] == '$facet0$')
                            _viewerState.Facet = PivotViewer.Utils.EscapeItemId(splitItem[1]);
                        //Selected Item
                        else if (splitItem[0] == '$selection$')
                            _viewerState.Selection = PivotViewer.Utils.EscapeItemId(splitItem[1]);
                        //Table Selected Facet
                        else if (splitItem[0] == '$tableFacet$')
                            _viewerState.TableFacet = PivotViewer.Utils.EscapeItemId(splitItem[1]);
                        //Map Centre X
                        else if (splitItem[0] == '$mapCentreX$')
                            _viewerState.MapCentreX = splitItem[1];
                        //Map Centre Y
                        else if (splitItem[0] == '$mapCentreY$')
                            _viewerState.MapCentreY = splitItem[1];
                        //Map Type
                        else if (splitItem[0] == '$mapType$')
                            _viewerState.MapType = PivotViewer.Utils.EscapeItemId(splitItem[1]);
                        //Map Zoom
                        else if (splitItem[0] == '$mapZoom$')
                            _viewerState.MapZoom = PivotViewer.Utils.EscapeItemId(splitItem[1]);
                        //Timeline Selected Facet
                        else if (splitItem[0] == '$timelineFacet$')
                            _viewerState.TimelineFacet = PivotViewer.Utils.EscapeItemId(splitItem[1]);
                        //Filters
                        else {
                            var filter = { Facet: splitItem[0], Predicates: [] };
                            var filters = splitItem[1].split('_');
                            for (var j = 0, _jLen = filters.length; j < _jLen; j++) {
                                //var pred = filters[j].split('.');
                                if (filters[j].indexOf('.') > 0) {
                                    var pred = filters[j].substring(0, filters[j].indexOf('.'));
                                    var value = filters[j].substring(filters[j].indexOf('.') + 1);
                                    //if (pred.length == 2)
                                    filter.Predicates.push({ Operator: pred, Value: value });
                                }
                            }
                            _viewerState.Filters.push(filter);
                        }
                    }
                }
            }
        },
        show: function () {
            Debug.Log('Show');
        },
        hide: function () {
            Debug.Log('Hide');
        }
    };

    InitPreloader = function () {
        //http://gifmake.com/
		var loc = { 
			top: ($('.pv-wrapper').height() / 2) - 33,
			left: ($('.pv-wrapper').width() / 2) - 43
		};
		var loader = ich.pv_template_loader(loc);
        _self.append(loader);
    };

    InitTileCollection = function () {
        InitUI();
        //init DZ Controller
        var baseCollectionPath = PivotCollection.ImageBase;
        if (!(baseCollectionPath.indexOf('http', 0) >= 0 || baseCollectionPath.indexOf('www.', 0) >= 0))
            baseCollectionPath = PivotCollection.CXMLBase.substring(0, PivotCollection.CXMLBase.lastIndexOf('/') + 1) + baseCollectionPath;
        var canvasContext = $('.pv-viewarea-canvas')[0].getContext("2d");

        //Init Tile Controller and start animation loop
        _tileController = new PivotViewer.Views.TileController(_imageController);
        _tiles = _tileController.initTiles(PivotCollection.Items, baseCollectionPath, canvasContext);
        //Init image controller
        _imageController.Setup(baseCollectionPath.replace("\\", "/"));
    };

    InitPivotViewer = function () {
        CreateFacetList();
        CreateViews();
        AttachEventHandlers();

        //loading completed
        $('.pv-loading').remove();

        //Apply ViewerState filters
        ApplyViewerState();
        _initSelectedItem = PivotCollection.GetItemById(_viewerState.Selection);
        _initTableFacet = _viewerState.TableFacet;
        
        //Set the width for displaying breadcrumbs as we now know the control sizes 
        //Hardcoding the value for the width of the viewcontrols images (145=29*5) as the webkit browsers 
        //do not know the size of the images at this point.
        var controlsWidth = $('.pv-toolbarpanel').innerWidth() - ($('.pv-toolbarpanel-brandimage').outerWidth(true) + 25 + $('.pv-toolbarpanel-name').outerWidth(true) + $('.pv-toolbarpanel-zoomcontrols').outerWidth(true) + 145 + $('.pv-toolbarpanel-sortcontrols').outerWidth(true));
        controlsWidth -= 30; //width of the item count

        $('.pv-toolbarpanel-facetbreadcrumb').css('width', controlsWidth + 'px');

        //select first view
        if (_viewerState.View != null) {
            if (_viewerState.View != 0 && _viewerState.View  != 1) {
                // Always have to initialize tiles one way or another
                SelectView(0, true);
                // Set handled init back to false
                _handledInitSettings = false;
            }
            SelectView(_viewerState.View, true);
        } else
            SelectView(0, true);

        //Begin tile animation
        var id = (_initSelectedItem && _initSelectedItem.Id) ? _initSelectedItem.Id : "";
        _tileController.BeginAnimation(true, id);

        // If Map view apply initial selection here
        if (_currentView == 3) {  
            if (_initSelectedItem) {
                $.publish("/PivotViewer/Views/Item/Selected", [{id: _initSelectedItem.Id, bkt: 0}]);
                _views[3].RedrawMarkers(_initSelectedItem.Id);
            } else {
                $.publish("/PivotViewer/Views/Item/Selected", [{id: "", bkt: 0}]);
                _views[3].RedrawMarkers("");
            }
        }

        //display tile count
        UpdateItemCount();
    };

    InitUI = function () {	
		var opts = {
			baseContentPath: null,
			pivotCollection: PivotCollection
		}
		mainPanel = ich.pv_template_mainapp(opts);
        _self.append(mainPanel);
		
		var mainPanelWidth = _self.width();
		var mainPanelHeight = _self.height() - $('.pv-toolbarpanel').height() - 6;		
		$('.pv-mainpanel').height(mainPanelHeight).width(mainPanelWidth);
		$('.pv-filterpanel').height(mainPanelHeight - 13);
		var canvas = $('.pv-viewarea-canvas')[0];
		canvas.height = mainPanelHeight;
		canvas.width = mainPanelWidth;
		$('.pv-infopanel').height(mainPanelHeight - 28).offset({left: mainPanelWidth - 205});
		$(".pv-filterpanel-accordion").css('height', ($(".pv-filterpanel").height() - $(".pv-filterpanel-search").height() - 75) + "px");
		
		var thatRef = 0;
        $('.pv-toolbarpanel-zoomslider').slider({
            max: 100,
            change: function (event, ui) {
                var val = ui.value - thatRef;
                //Find canvas centre
                centreX = $('.pv-viewarea-canvas').width() / 2;
                centreY = $('.pv-viewarea-canvas').height() / 2;
                $.publish("/PivotViewer/Views/Canvas/Zoom", [{ x: centreX, y: centreY, delta: 0.5 * val}]);
                thatRef = ui.value;
            }
        });

        var filterPanel = $('.pv-filterpanel');
        if (navigator.userAgent.match(/iPad/i) != null)
            $('.pv-filterpanel-search').css('width', filterPanel.width() - 10 + 'px');
        else
            $('.pv-filterpanel-search').css('width', filterPanel.width() - 2 + 'px');
        $('.pv-filterpanel-search-autocomplete')
            .css('width', filterPanel.width() - 8 + 'px')
            .hide();
    };
	

    //Creates facet list for the filter panel
    //Adds the facets into the filter select list
    CreateFacetList = function () {
        //build list of all facets - used to get id references of all facet items and store the counts
        for (var i = 0; i < PivotCollection.Items.length; i++) {
            var currentItem = PivotCollection.Items[i];

            //Go through Facet Categories to get properties
            for (var m = 0; m < PivotCollection.FacetCategories.length; m++) {
                var currentFacetCategory = PivotCollection.FacetCategories[m];

                //Add to the facet panel
                var hasValue = false;

                //Get values                    
                for (var j = 0, _jLen = currentItem.Facets.length; j < _jLen; j++) {
                    var currentItemFacet = currentItem.Facets[j];
                    //If the facet is found then add it's values to the list
                    if (currentItemFacet.Name == currentFacetCategory.Name) {
                        for (var k = 0; k < currentItemFacet.FacetValues.length; k++) {
                            if (currentFacetCategory.Type == PivotViewer.Models.FacetType.String ||
                                currentFacetCategory.Type == PivotViewer.Models.FacetType.Link) {
                                var found = false;
                                var itemId = "pv-facet-item-" + CleanName(currentItemFacet.Name) + "__" + CleanName(currentItemFacet.FacetValues[k].Value);
                                for (var n = _facetItemTotals.length - 1; n > -1; n -= 1) {
                                    if (_facetItemTotals[n].itemId == itemId) {
                                        _facetItemTotals[n].count += 1;
                                        found = true;
                                        break;
                                    }
                                }

                                if (!found)
                                    _facetItemTotals.push({ itemId: itemId, itemValue: currentItemFacet.FacetValues[k].Value, facet: currentItemFacet.Name, count: 1 });
                            }
                            else if (currentFacetCategory.Type == PivotViewer.Models.FacetType.Number) {
                                //collect all the numbers to update the histogram
                                var numFound = false;
                                for (var n = 0; n < _facetNumericItemTotals.length; n++) {
                                    if (_facetNumericItemTotals[n].Facet == currentItem.Facets[j].Name) {
                                        _facetNumericItemTotals[n].Values.push(currentItemFacet.FacetValues[k].Value);
                                        numFound = true;
                                        break;
                                    }
                                }
                                if (!numFound)
                                    _facetNumericItemTotals.push({ Facet: currentItemFacet.Name, Values: [currentItemFacet.FacetValues[k].Value] });
                            }
                        }
                        hasValue = true;
                    }
                }

                if (!hasValue) {
                    //Create (no info) value
                    var found = false;
                    var itemId = "pv-facet-item-" + CleanName(currentFacetCategory.Name) + "__" + CleanName("(no info)");
                    for (var n = _facetItemTotals.length - 1; n > -1; n -= 1) {
                        if (_facetItemTotals[n].itemId == itemId) {
                            _facetItemTotals[n].count += 1;
                            found = true;
                            break;
                        }
                    }

                    if (!found)
                        _facetItemTotals.push({ itemId: itemId, itemValue: "(no info)", facet: currentFacetCategory.Name, count: 1 });
                }

                //Add to the word wheel cache array
                if (currentFacetCategory.IsWordWheelVisible) {
                    //Get values                    
                    for (var j = 0, _jLen = currentItem.Facets.length; j < _jLen; j++) {
                        var currentItemFacet = currentItem.Facets[j];
                        //If the facet is found then add it's values to the list
                        if (currentItemFacet.Name == currentFacetCategory.Name) {
                            for (var k = 0; k < currentItemFacet.FacetValues.length; k++) {
                                if (currentFacetCategory.Type == PivotViewer.Models.FacetType.String) {
                                    _wordWheelItems.push({ Facet: currentItemFacet.Name, Value: currentItemFacet.FacetValues[k].Value });
                                }
                            }
                        }
                    }
                }
            }
        }

        CreateDatetimeBuckets();

        var facets = $(".pv-filterpanel-accordion");
        var sort = [];
        for (var i = 0; i < PivotCollection.FacetCategories.length; i++) {
            //Create facet controls
            if (PivotCollection.FacetCategories[i].Type == PivotViewer.Models.FacetType.DateTime ) {
				facets.append(CreateDateTimeFacet(PivotCollection.FacetCategories[i]));
			}
            else if (PivotCollection.FacetCategories[i].Type == PivotViewer.Models.FacetType.String ||
                     PivotCollection.FacetCategories[i].Type == PivotViewer.Models.FacetType.Link) {
				facets.append(CreateStringFacet(PivotCollection.FacetCategories[i]));
            }
            else if (PivotCollection.FacetCategories[i].Type == PivotViewer.Models.FacetType.Number) {
				for (var j = 0; j < _facetNumericItemTotals.length; j++)	{
					if (_facetNumericItemTotals[j].Facet == PivotCollection.FacetCategories[i].Name) {
						facets.append(ich.pv_template_facettype_number(PivotCollection.FacetCategories[i]));
					}
				}
			}
        }

        //Default sorts
        for (var i = 0; i < PivotCollection.FacetCategories.length; i++) {
            if (PivotCollection.FacetCategories[i].IsFilterVisible)
                SortFacetItems(PivotCollection.FacetCategories[i].Name);
        }

        $(".pv-filterpanel-accordion").accordion({
			heightStyle: "fill",
			collapsible: true
        });
		
        $('.pv-toolbarpanel-sortcontrols').append(ich.pv_template_toolbar_sort(PivotCollection));

        //setup numeric facets
        for (var i = 0; i < _facetNumericItemTotals.length; i++)
            CreateNumberFacet(CleanName(_facetNumericItemTotals[i].Facet), _facetNumericItemTotals[i].Values);
    };

    /// Create the individual controls for the facet	
	CreateDateTimeFacets = function (facetCategory) {
		var f = null;
	
		if (faceCategory.decadeBuckets.length > 1) {				
			f = CreateBucketizedDateTimeFacets(
				faceCategory, 
				[
					faceCategory.decadeBuckets, 
					faceCategory.yearBuckets
				],
				[
					faceCategory.monthBuckets,
					faceCategory.dayBuckets,
					faceCategory.hourBuckets,
					faceCategory.minuteBuckets,
					faceCategory.secondBuckets
				]
			);
		} else if (faceCategory.yearBuckets.length > 1) {
			f = CreateBucketizedDateTimeFacets(
				faceCategory, 
				[
					faceCategory.yearBuckets,
					faceCategory.monthBuckets
				],
				[
					faceCategory.decadeBuckets, 
					faceCategory.dayBuckets,
					faceCategory.hourBuckets,
					faceCategory.minuteBuckets,
					faceCategory.secondBuckets
				]
			);
		} else if (faceCategory.monthBuckets.length > 1) {
			f = CreateBucketizedDateTimeFacets(
				faceCategory, 
				[
					faceCategory.monthBuckets,
					faceCategory.dayBuckets
				],
				[
					faceCategory.decadeBuckets, 
					faceCategory.yearBuckets,
					faceCategory.hourBuckets,
					faceCategory.minuteBuckets,
					faceCategory.secondBuckets
				]
			);
		} else if (faceCategory.dayBuckets.length > 1) {
			f = CreateBucketizedDateTimeFacets(
				faceCategory, 
				[
					faceCategory.dayBuckets,
					faceCategory.hourBuckets
				],
				[
					faceCategory.decadeBuckets, 
					faceCategory.yearBuckets,
					faceCategory.monthBuckets,
					faceCategory.minuteBuckets,
					faceCategory.secondBuckets
				]
			);
		} else if (faceCategory.hourBuckets.length > 1) {
			f = CreateBucketizedDateTimeFacets(
				faceCategory, 
				[
					faceCategory.hourBuckets,
					faceCategory.minuteBuckets
				],
				[
					faceCategory.decadeBuckets, 
					faceCategory.yearBuckets,
					faceCategory.monthBuckets,
					faceCategory.dayBuckets,
					faceCategory.secondBuckets
				]
			);
		} else if (faceCategory.minuteBuckets.length > 1) {
			f = CreateBucketizedDateTimeFacets(
				faceCategory, 
				[
					faceCategory.minuteBuckets,
					faceCategory.secondBuckets,							
				],
				[
					faceCategory.decadeBuckets, 
					faceCategory.yearBuckets,
					faceCategory.monthBuckets,
					faceCategory.dayBuckets,
					faceCategory.hourBuckets
				]
			);
		} else if (faceCategory.secondBuckets.length > 1) {
			f = CreateBucketizedDateTimeFacets(
				faceCategory, 
				[
					faceCategory.secondBuckets
				],
				[
					faceCategory.decadeBuckets, 
					faceCategory.yearBuckets,
					faceCategory.monthBuckets,
					faceCategory.dayBuckets,
					faceCategory.hourBuckets,
					faceCategory.minuteBuckets
				]
			);
		}
		
		return f;
	
	}
	
    CreateBucketizedDateTimeFacets = function (facetCategory, visibleBuckets, hiddenBuckets) {
		var f = facetCategory;
		f.VisibleBuckets = [];
		f.HiddenBuckets = [];
		f.NoInfo = [];
		var cleanFacetName = CleanName(facetCategory.Name);
		var faceName = faceCategory.Name.toString();
		
        for (var k = 0; k < visibleBuckets.length; k++) {
            for (var i = 0; i < visibleBuckets[k].length; i++) {
				var f = {
					itemId: 'pv-facet-item-' + cleanFacetName + '__' + CleanName(visibleBuckets[k][i].Name.toString()),
					itemValue: visibleBuckets[k][i].Name,
					facet: faceName
				};
				f.VisibleBuckets.push(f);
            }	
        }

        for (var k = 0; k < hiddenBuckets.length; k++) {
            for (var i = 0; i < hiddenBuckets[k].length; i++) {
				var f = {
					itemId: 'pv-facet-item-' + cleanFacetName + '__' + CleanName(hiddenBuckets[k][i].Name.toString()),
					itemValue: hiddenBuckets[k][i].Name,
					facet: faceName
				};
				f.HiddenBuckets.push(f);
            }	
        }
		
        for (var i = 0; i < _facetItemTotals.length; i++) {
            if (_facetItemTotals[i].facet == facetCategory.Name && _facetItemTotals[i].itemValue == '(no info)') {
				f.NoInfo.push(_facetItemTotals[i]);
            }
        }  
		
		return ich.pv_template_facettype_datetime(f);
    };

    CreateStringFacet = function (facetCategory) {
		var o = [];
        for (var i = 0; i < _facetItemTotals.length; i++) {
            if (_facetItemTotals[i].facet == facetCategory.Name) {
				o.push(_facetItemTotals[i]);
            }
        }  
		var f = facetCategory;
		f.items = o;
		
        return ich.pv_template_facettype_string(f);
    };
	
    CreateNumberFacet = function (facetName, facetValues) {
        //histogram dimensions
		var f = {};
		f.Name = facetName;
		f.Height = 80;
		f.Width = 165;

        //Create histogram
        f.histogram = PivotViewer.Utils.Histogram(facetValues);
		f.bars = [];
        //work out column width based on chart width
        var columnWidth = (0.5 + (f.Width / f.histogram.BinCount)) | 0;
        //draw the bars
        for (var k = 0, _kLen = f.histogram.Histogram.length; k < _kLen; k++) {
            var barHeight = (0.5 + (f.Height / (f.histogram.MaxCount / f.histogram.Histogram[k].length))) | 0;
            var barX = (0.5 + (columnWidth * k)) | 0;
			var barY = f.Height - barHeight;
            f.bars.push({x: barX, y: barY, w: columnWidth, h: barHeight});
        }
		
		var chartWrapper = $("#pv-filterpanel-category-numberitem-" + PivotViewer.Utils.EscapeMetaChars(facetName));
        chartWrapper.empty();
		chartWrapper.append(ich.pv_template_facettype_number_internal(f));
		
        var s = $('#pv-filterpanel-numericslider-' + PivotViewer.Utils.EscapeMetaChars(facetName));
		//var s = $(h).find('#pv-filterpanel-numericslider-' + PivotViewer.Utils.EscapeMetaChars(facetCategory.Name));
        s.slider({
            range: true,
            min: f.histogram.Min,
            max: f.histogram.Max,
            values: [f.histogram.Min, f.histogram.Max],
            slide: function (event, ui) {
                $(this).parent().find('.pv-filterpanel-numericslider-range-val').text(ui.values[0] + " - " + ui.values[1]);
            },
            stop: function (event, ui) {
                var thisWrapped = $(this);
                var thisMin = thisWrapped.slider('option', 'min'),
                            thisMax = thisWrapped.slider('option', 'max');
                if (ui.values[0] > thisMin || ui.values[1] < thisMax)
                    thisWrapped.parent().parent().prev().find('.pv-filterpanel-accordion-heading-clear').css('visibility', 'visible');
                else if (ui.values[0] == thisMin && ui.values[1] == thisMax)
                    thisWrapped.parent().parent().prev().find('.pv-filterpanel-accordion-heading-clear').css('visibility', 'hidden');
                FilterCollection(false);
            }
        });
    };

    /// Creates and initialises the views - including plug-in views
    /// Init shared canvas
    CreateViews = function () {

        var viewPanel = $('.pv-viewpanel');
        var width = _self.width();
        var height = $('.pv-mainpanel').height();
        var offsetX = $('.pv-filterpanel').width() + 18;
        var offsetY = 4;

        //Create instances of all the views
        _views.push(new PivotViewer.Views.GridView());
        _views.push(new PivotViewer.Views.GraphView());
        _views.push(new PivotViewer.Views.TableView());

        //init the views interfaces
        for (var i = 0; i < _views.length; i++) {
            try {
                if (_views[i] instanceof PivotViewer.Views.IPivotViewerView) {
                    _views[i].Setup(width, height, offsetX, offsetY, _tileController.GetMaxTileRatio());
					
					var o = {
						viewIndex: i,
						viewName: _views[i].GetViewName(),
						buttonPath: _views[i].GetButtonImage(),
						viewUI: _views[i].GetUI()
					};

					var viewpanel_view = ich.pv_template_viewpanel_view(o);
					viewPanel.append(viewpanel_view);

					var toolbar_viewcontrols = ich.pv_template_toolbar_viewcontrols(o);
					$('.pv-toolbarpanel-viewcontrols').append(toolbar_viewcontrols);
                } else {
                    var msg = '';
                    msg = msg + 'View does not inherit from PivotViewer.Views.IPivotViewerView<br>';
                    $('.pv-wrapper').append("<div id=\"pv-view-error\" class=\"pv-modal-dialog\"><div><a href=\"#pv-modal-dialog-close\" title=\"Close\" class=\"pv-modal-dialog-close\">X</a><h2>HTML5 PivotViewer</h2><p>" + msg + "</p></div></div>");
                    window.open("#pv-view-error","_self")
                }
            } catch (ex) { alert(ex.Message); }
        }

       // The table, graph and the map view needs to know about the facet categories
       _views[1].SetFacetCategories(PivotCollection);
       _views[2].SetFacetCategories(PivotCollection);

    };

    /// Google API has loaded
    global.setMapReady = function () {
        _googleAPILoaded = true;
        SelectView(3, true);
    };

    /// Set the current view
    SelectView = function (viewNumber, init) {

        // If changing to map view and the Google API has not yet loaded,
        // load it now.
        if (viewNumber == 3 && !_googleAPILoaded && _googleAPIKey) {
            // Load the google maps api
            var script = document.createElement("script");
            script.type = "text/javascript";
            script.src = "https://maps.googleapis.com/maps/api/js?key=" + _googleAPIKey + "&sensor=false&callback=global.setMapReady";
            document.body.appendChild(script);
            return;
        }
        
        if (viewNumber == 3 && !_googleAPIKey) {
            var msg = '';
            msg = msg + 'Viewing the data on Google maps requires an API key. This can be obtained from <a href=\"https://code.google.com/apis/console/?noredirect\" target=\"_blank\">here</a>';
            $('.pv-wrapper').append("<div id=\"pv-nomapkey-error\" class=\"pv-modal-dialog\"><div><a href=\"#pv-modal-dialog-close\" title=\"Close\" class=\"pv-modal-dialog-close\">X</a><h2>HTML5 PivotViewer</h2><p>" + msg + "</p></div></div>");
            var t=setTimeout(function(){window.open("#pv-nomapkey-error","_self")},1000)
            return;
        }

        //Deselect all views
        for (var i = 0; i < _views.length; i++) {
            if (viewNumber != i) {
                $('#pv-viewpanel-view-' + i + '-image').attr('src', _views[i].GetButtonImage());
                _views[i].Deactivate();
                _views[i].init = false;
            }
        }
        $('#pv-viewpanel-view-' + viewNumber + '-image').attr('src', _views[viewNumber].GetButtonImageSelected());
        if (_currentView == 1 && (viewNumber == 2 || viewNumber == 3)) {
            // Move tiles back to grid positions - helps with maintaining selected item 
            // when changing views
            _views[0].Activate();
            _views[0].init = init;
            _currentView = 0;
            FilterCollection(true);
        }
        _views[viewNumber].Activate();
        _views[viewNumber].init = init;

        _currentView = viewNumber;
        if (viewNumber == 1) {
          $.publish("/PivotViewer/Views/Item/Selected", [{id: "", bkt: 0}]);
          _selectedItem = "";
        }
        FilterCollection(true);
    };

    ///Sorts the facet items based on a specific sort type
    SortFacetItems = function (facetName) {
        if (PivotCollection.GetFacetCategoryByName(facetName).Type == PivotViewer.Models.FacetType.DateTime)
            return;
        //get facets
        var facetList = $("#pv-cat-" + PivotViewer.Utils.EscapeMetaChars(CleanName(facetName)) + " ul");
        var sortType = facetList.prev().text().replace("Sort: ", "");
        var facetItems = facetList.children("li").get();
        if (sortType == "A-Z") {
            facetItems.sort(function (a, b) {
                var compA = $(a).children().first().attr("itemvalue");
                var compB = $(b).children().first().attr("itemvalue");
                return (compA < compB) ? 1 : (compA > compB) ? -1 : 0;
            });
        } else if (sortType == "Quantity") {
            facetItems.sort(function (a, b) {
                var compA = parseInt($(a).children(".pv-facet-facetitem-count").text());
                var compB = parseInt($(b).children(".pv-facet-facetitem-count").text());
                return (compA < compB) ? -1 : (compA > compB) ? 1 : 0;
            });
        } else {
            var facet = PivotCollection.GetFacetCategoryByName(facetName);
            if (facet.CustomSort != undefined) {
                var sortList = [];
                for (var i = facet.CustomSort.SortValues.length - 1; i > -1; i -= 1) {
                    for (var j = 0; j < facetItems.length; j++) {
                        if (facet.CustomSort.SortValues[i] == $(facetItems[j]).children(".pv-facet-facetitem-label").text()) {
                            sortList.push(facetItems[j]);
                            found = true;
                        }
                    }
                }
                facetItems = sortList;
            }
        }
        for (var i = 0; i < facetItems.length; i++) {
            facetList.prepend(facetItems[i]);
        }
    };

    //Facet: splitItem[0], Operator: filter[0], Value: filter[1]
    //Applies the filters and sorted facet from the viewer state
    ApplyViewerState = function () {
        //Sort
        if (_viewerState.Facet != null) {
            $('.pv-toolbarpanel-sort option[value=' + CleanName(_viewerState.Facet) + ']').prop('selected', 'selected');
	    _currentSort = $('.pv-toolbarpanel-sort :selected').attr('label');
            Debug.Log('current sort ' + _currentSort );
	}

        //Filters
        for (var i = 0, _iLen = _viewerState.Filters.length; i < _iLen; i++) {
            var showDateControls = false;
            for (var j = 0, _jLen = _viewerState.Filters[i].Predicates.length; j < _jLen; j++) {
                var operator = _viewerState.Filters[i].Predicates[j].Operator;
                if (operator == "GT" || operator == "GE" || operator == "LT" || operator == "LE") {
                    var s = $('#pv-filterpanel-numericslider-' + CleanName(_viewerState.Filters[i].Facet));
                    if (s.length > 0) { // a numeric value 
                        var intvalue = parseFloat(_viewerState.Filters[i].Predicates[j].Value);
                        switch (operator) {
                            case "GT":
                                s.slider("values", 0, intvalue + 1);
                                break;
                            case "GE":
                                s.slider("values", 0, intvalue);
                                break;
                            case "LT":
                                s.slider("values", 1, intvalue - 1);
                                break;
                            case "LE":
                                s.slider("values", 1, intvalue);
                                break;
                        }
                        s.parent().find('.pv-filterpanel-numericslider-range-val').text(s.slider("values", 0) + " - " + s.slider("values", 1));
                        s.parent().parent().prev().find('.pv-filterpanel-accordion-heading-clear').css('visibility', 'visible');
                    } else { // it must be a date range
                        var facetName = CleanName(_viewerState.Filters[i].Facet);
       	                var cb = $('#pv-facet-item-' + facetName + '___CustomRange')[0].firstElementChild;
                        cb.checked = true;
                        if (!showDateControls){
                            GetCustomDateRange(facetName);
                            showDateControls = true;
                        }
                        switch (operator) {
                            case "GE":
/*
        $('#pv-custom-range-' + facetName + '__Start').css('visibility', 'visible'); 
    $('#pv-custom-range-' + facetName + '__StartDate').datepicker({
            showOn: 'button',
            changeMonth: true,
            changeYear: true,
            buttonText: 'Show Date',
            buttonImageOnly: true,
            buttonImage: 'http://jqueryui.com/resources/demos/datepicker/images/calendar.gif'
        });
*/
                                $('#pv-custom-range-' + facetName + '__StartDate')[0].value = new Date(_viewerState.Filters[i].Predicates[j].Value);
                                CustomRangeChanged($('#pv-custom-range-' + facetName + '__StartDate')[0]);
                            break;
                            case "LE":
/*
        $('#pv-custom-range-' + facetName + '__Finish').css('visibility', 'visible'); 
        $('#pv-custom-range-' + facetName + '__FinishDate').datepicker({
            showOn: 'button',
            changeMonth: true,
            changeYear: true,
            buttonText: 'Show Date',
            buttonImageOnly: true,
            buttonImage: 'http://jqueryui.com/resources/demos/datepicker/images/calendar.gif'
        });
*/
                                $('#pv-custom-range-' + facetName + '__FinishDate')[0].value = new Date(_viewerState.Filters[i].Predicates[j].Value);
                                CustomRangeChanged($('#pv-custom-range-' + facetName+ '__FinishDate')[0]);
                            break;
                        }
                    }
                } else if (operator == "EQ") {
                    //String facet
                    SelectStringFacetItem(
                        CleanName(_viewerState.Filters[i].Facet),
                        CleanName(_viewerState.Filters[i].Predicates[j].Value)
                    );
                } else if (operator == "NT") {
                    //No Info string facet
                    SelectStringFacetItem(
                        CleanName(_viewerState.Filters[i].Facet),
                        "_no_info_"
                    );
                }
            }
        }
    };

    //Selects a string facet
    SelectStringFacetItem = function (facet, value) {
        var cb = $('.pv-facet-facetitem[itemfacet="' + facet + '"][itemvalue="' + value + '"]');
        cb.prop('checked', true);
        cb.parent().parent().parent().prev().find('.pv-filterpanel-accordion-heading-clear').css('visibility', 'visible');
    };

    /// Filters the collection of items and updates the views
    FilterCollection = function (changingView) {
        var filterItems = [];
        var foundItemsCount = [];
        var selectedFacets = [];
        var sort = $('.pv-toolbarpanel-sort option:selected').attr('label');
        Debug.Log('sort ' + sort );

        if (!changingView)
            _selectedItem = "";

        //Filter String facet items
        var checked = $('.pv-facet-facetitem:checked');

        //Turn off clear all button
        $('.pv-filterpanel-clearall').css('visibility', 'hidden');

        //Filter String facet items
        //create an array of selected facets and values to compare to all items.
        var stringFacets = [];
        var datetimeFacets = [];
        for (var i = 0; i < checked.length; i++) {
            var facet = _nameMapping[$(checked[i]).attr('itemfacet')];
            var facetValue = _nameMapping[$(checked[i]).attr('itemvalue')];
            var category = PivotCollection.GetFacetCategoryByName(facet);
            if (category.Type == PivotViewer.Models.FacetType.String) {
                var found = false;
                for (var j = 0; j < stringFacets.length; j++) {
                    if (stringFacets[j].facet == facet) {
                        stringFacets[j].facetValue.push(facetValue);
                        found = true;
                    }
                }
                if (!found)
                    stringFacets.push({ facet: facet, facetValue: [facetValue] });
        
                //Add to selected facets list - this is then used to filter the facet list counts
                if ($.inArray(facet, selectedFacets) < 0)
                    selectedFacets.push(facet);
            } else if (category.Type == PivotViewer.Models.FacetType.DateTime) {
                
                var start = $('#pv-custom-range-' + CleanName(facet) + '__StartDate')[0].value;
                var end = $('#pv-custom-range-' + CleanName(facet) + '__FinishDate')[0].value;
                if (start && end) {
                    datetimeFacets.push({ facet: facet, facetValue: [facetValue], minDate: new Date(start), maxDate: new Date(end) });
                } else {
                var found = false;
                    for (var j = 0; j < datetimeFacets.length; j++) {
                        if (datetimeFacets[j].facet == facet) {
                            datetimeFacets[j].facetValue.push(facetValue);
                            found = true;
                        }
                    }
                    if (!found)
                        datetimeFacets.push({ facet: facet, facetValue: [facetValue] });
                }
        
                //Add to selected facets list - this is then used to filter the facet list counts
                if ($.inArray(facet, selectedFacets) < 0)
                    selectedFacets.push(facet);
        
            }
        }

        //Numeric facet items. Find all numeric types that have been filtered
        var numericFacets = [];
        for (var i = 0, _iLen = PivotCollection.FacetCategories.length; i < _iLen; i++) {
            if (PivotCollection.FacetCategories[i].Type == PivotViewer.Models.FacetType.Number) {
                var numbFacet = $('#pv-filterpanel-category-numberitem-' + CleanName(PivotCollection.FacetCategories[i].Name));
                var sldr = $(numbFacet).find('.pv-filterpanel-numericslider');
                if (sldr.length > 0) {
                    var range = sldr.slider("values");
                    var rangeMax = sldr.slider('option', 'max'), rangeMin = sldr.slider('option', 'min');
                    if (range[0] != rangeMin || range[1] != rangeMax) {
                        var facet = PivotCollection.FacetCategories[i].Name;
                        numericFacets.push({ facet: facet, selectedMin: range[0], selectedMax: range[1], rangeMin: rangeMin, rangeMax: rangeMax });
                        //Add to selected facets list - this is then used to filter the facet list counts
                        if ($.inArray(facet, selectedFacets) < 0)
                            selectedFacets.push(facet);
                    }
                }
            }
        }

        //Find matching facet values in items
        for (var i = 0, _iLen = PivotCollection.Items.length; i < _iLen; i++) {
            var foundCount = 0;

            //Look for ("no info") in string filters
            //Go through all filters facets 
            for (var k = 0, _kLen = stringFacets.length; k < _kLen; k++) {
                //Look for value matching "(no info)"
                for (var n = 0, _nLen = stringFacets[k].facetValue.length; n < _nLen; n++) {
                    if (stringFacets[k].facetValue[n] == "(no info)") {
                        // See if facet is defined for the item
                        var definedForItem = false;
                        for (var j = 0, _jLen = PivotCollection.Items[i].Facets.length; j < _jLen; j++) {
                            if (PivotCollection.Items[i].Facets[j].Name == stringFacets[k].facet){
                                //Facet is defined for that item
                                definedForItem = true;
                            }
                        }
                        //Tried all of the items facets
                        // Matches ("no info")
                        if (definedForItem == false)
                            foundCount++;
                    }
                }
            }

            for (var j = 0, _jLen = PivotCollection.Items[i].Facets.length; j < _jLen; j++) {
                //String facets
                for (var k = 0, _kLen = stringFacets.length; k < _kLen; k++) {
                    var valueFoundForFacet = 0;

                    if (PivotCollection.Items[i].Facets[j].Name == stringFacets[k].facet) {
                        for (var m = 0, _mLen = PivotCollection.Items[i].Facets[j].FacetValues.length; m < _mLen; m++) {
                            for (var n = 0, _nLen = stringFacets[k].facetValue.length; n < _nLen; n++) {
                                if (PivotCollection.Items[i].Facets[j].FacetValues[m].Value == stringFacets[k].facetValue[n])
                                    valueFoundForFacet++;
                            }
                        }
                    }
                    // Handles the posibility that and item might match several values of one facet
                    if (valueFoundForFacet > 0 )
                      foundCount++;
                }
            }

            //if the item was not in the string filters then exit early
            if (foundCount != stringFacets.length)
                continue;

            //Look for ("no info") in numeric filters
            //Go through all filters facets 
            for (var k = 0, _kLen = numericFacets.length; k < _kLen; k++) {
                //Look for value matching "(no info)"
                    if (numericFacets[k].selectedMin == "(no info)") {
                        // See if facet is defined for the item
                        var definedForItem = false;
                        for (var j = 0, _jLen = PivotCollection.Items[i].Facets.length; j < _jLen; j++) {
                            if (PivotCollection.Items[i].Facets[j].Name == numericFacets[k].facet){
                                //Facet is defined for that item
                                definedForItem = true;
                            }
                        }
                        //Tried all of the items facets
                        // Matches ("no info")
                        if (definedForItem == false)
                            foundCount++;
                    }
            }

            for (var j = 0, _jLen = PivotCollection.Items[i].Facets.length; j < _jLen; j++) {
                //Numeric facets
                for (var k = 0, _kLen = numericFacets.length; k < _kLen; k++) {
                    if (PivotCollection.Items[i].Facets[j].Name == numericFacets[k].facet) {
                        for (var m = 0, _mLen = PivotCollection.Items[i].Facets[j].FacetValues.length; m < _mLen; m++) {
                            var parsed = parseFloat(PivotCollection.Items[i].Facets[j].FacetValues[m].Value);
                            if (!isNaN(parsed) && parsed >= numericFacets[k].selectedMin && parsed <= numericFacets[k].selectedMax)
                                foundCount++;
                        }
                    }
                }
            }

            if (foundCount != (stringFacets.length + numericFacets.length))
                continue;

            //Look for ("no info") in datetime filters
            //Go through all filters facets 
            for (var k = 0, _kLen = datetimeFacets.length; k < _kLen; k++) {
                for (var n = 0, _nLen = datetimeFacets[k].facetValue.length; n < _nLen; n++) {
                    if (datetimeFacets[k].facetValue[n] == "(no info)") {
                        // See if facet is defined for the item
                        var definedForItem = false;
                        for (var j = 0, _jLen = PivotCollection.Items[i].Facets.length; j < _jLen; j++) {
                            if (PivotCollection.Items[i].Facets[j].Name == datetimeFacets[k].facet){
                                //Facet is defined for that item
                                definedForItem = true;
                            }
                        }
                        //Tried all of the items facets
                        // Matches ("no info")
                        if (definedForItem == false)
                            foundCount++;
                    }
                }
            }
            for (var j = 0, _jLen = PivotCollection.Items[i].Facets.length; j < _jLen; j++) {
                //DateTime facets
                for (var k = 0, _kLen = datetimeFacets.length; k < _kLen; k++) {
                    var valueFoundForFacet = 0;

                    if (PivotCollection.Items[i].Facets[j].Name == datetimeFacets[k].facet) {
                        if (datetimeFacets[k].minDate && datetimeFacets[k].maxDate) {
                            var itemDate = new Date (PivotCollection.Items[i].Facets[j].FacetValues[0].Value);
                            if ( itemDate <= datetimeFacets[k].maxDate &&
                                 itemDate >= datetimeFacets[k].minDate) {
                                valueFoundForFacet++;
                            }
                        } else {
                            var category = PivotCollection.GetFacetCategoryByName(datetimeFacets[k].facet);
                            // So I have the itemId PivotCollection.Items[i].Id
                            // I have the selected bucket
                            // I need to find the selected bucket in one of the bucket arrays but I don't know which one
                            // First search the decade buckets
                            for (var n = 0, _nLen = datetimeFacets[k].facetValue.length; n < _nLen; n++) {
                                for (l = 0; l < category.decadeBuckets.length; l++) {
                                    if (category.decadeBuckets[l].Name == datetimeFacets[k].facetValue[n]) 
                                        for (var m = 0; m < category.decadeBuckets[l].Items.length; m++) {
                                            if (category.decadeBuckets[l].Items[m] == PivotCollection.Items[i].Id)
                                                valueFoundForFacet++;
                                        }
                                }
                            }
                            // year buckets
                            for (var n = 0, _nLen = datetimeFacets[k].facetValue.length; n < _nLen; n++) {
                                for (l = 0; l < category.yearBuckets.length; l++) {
                                    if (category.yearBuckets[l].Name == datetimeFacets[k].facetValue[n]) 
                                        for (var m = 0; m < category.yearBuckets[l].Items.length; m++) {
                                            if (category.yearBuckets[l].Items[m] == PivotCollection.Items[i].Id)
                                                valueFoundForFacet++;
                                        }
                                }
                            }
                            // month buckets
                            for (var n = 0, _nLen = datetimeFacets[k].facetValue.length; n < _nLen; n++) {
                                for (l = 0; l < category.monthBuckets.length; l++) {
                                    if (category.monthBuckets[l].Name == datetimeFacets[k].facetValue[n]) 
                                        for (var m = 0; m < category.monthBuckets[l].Items.length; m++) {
                                            if (category.monthBuckets[l].Items[m] == PivotCollection.Items[i].Id)
                                                valueFoundForFacet++;
                                        }
                                }
                            }
                            // day buckets
                            for (var n = 0, _nLen = datetimeFacets[k].facetValue.length; n < _nLen; n++) {
                                for (l = 0; l < category.dayBuckets.length; l++) {
                                    if (category.dayBuckets[l].Name == datetimeFacets[k].facetValue[n]) 
                                        for (var m = 0; m < category.dayBuckets[l].Items.length; m++) {
                                            if (category.dayBuckets[l].Items[m] == PivotCollection.Items[i].Id)
                                                valueFoundForFacet++;
                                        }
                                }
                            }
                            // hour buckets
                            for (var n = 0, _nLen = datetimeFacets[k].facetValue.length; n < _nLen; n++) {
                                for (l = 0; l < category.hourBuckets.length; l++) {
                                    if (category.hourBuckets[l].Name == datetimeFacets[k].facetValue[n]) 
                                        for (var m = 0; m < category.hourBuckets[l].Items.length; m++) {
                                            if (category.hourBuckets[l].Items[m] == PivotCollection.Items[i].Id)
                                                valueFoundForFacet++;
                                        }
                                }
                            }
                            // minute buckets
                            for (var n = 0, _nLen = datetimeFacets[k].facetValue.length; n < _nLen; n++) {
                                for (l = 0; l < category.minuteBuckets.length; l++) {
                                    if (category.minuteBuckets[l].Name == datetimeFacets[k].facetValue[n]) 
                                        for (var m = 0; m < category.minuteBuckets[l].Items.length; m++) {
                                            if (category.minuteBuckets[l].Items[m] == PivotCollection.Items[i].Id)
                                                valueFoundForFacet++;
                                        }
                                }
                            }
                            // second buckets
                            for (var n = 0, _nLen = datetimeFacets[k].facetValue.length; n < _nLen; n++) {
                                for (l = 0; l < category.secondBuckets.length; l++) {
                                    if (category.secondBuckets[l].Name == datetimeFacets[k].facetValue[n]) 
                                        for (var m = 0; m < category.secondBuckets[l].Items.length; m++) {
                                            if (category.secondBuckets[l].Items[m] == PivotCollection.Items[i].Id)
                                                valueFoundForFacet++;
                                        }
                                }
                            }
                        }
                    }
                    // Handles the posibility that and item might match several values of one facet
                    if (valueFoundForFacet > 0 )
                      foundCount++;
                }
            }

            if (foundCount != (stringFacets.length + numericFacets.length + datetimeFacets.length))
                continue;

            //Item is in all filters
            filterItems.push(PivotCollection.Items[i].Id);

            if ((stringFacets.length + numericFacets.length + datetimeFacets.length) > 0)
                $('.pv-filterpanel-clearall').css('visibility', 'visible');
        }

	// Tidy this up
	_numericFacets = numericFacets;
	_stringFacets = stringFacets;
	_datetimeFacets = datetimeFacets;

        $('.pv-viewpanel-view').hide();
        $('#pv-viewpanel-view-' + _currentView).show();
        //Filter the facet counts and remove empty facets
        FilterFacets(filterItems, selectedFacets);

        //Update breadcrumb
        UpdateBreadcrumbNavigation(stringFacets, numericFacets, datetimeFacets);

        //Filter view
        _tileController.SetCircularEasingBoth();
        if (!_handledInitSettings){
            if (_currentView == 2) { 
                _views[_currentView].SetSelectedFacet(_initTableFacet);
                _views[_currentView].Filter(_tiles, filterItems, sort, stringFacets, changingView, _initSelectedItem);
            } else 
                _views[_currentView].Filter(_tiles, filterItems, sort, stringFacets, changingView, _selectedItem);
            _handledInitSettings = true;
        }
        else {
            _views[_currentView].Filter(_tiles, filterItems, sort, stringFacets, changingView, _selectedItem);
            if ((_currentView == 2 || _currentView == 3) && !changingView) { 
                _views[0].Filter(_tiles, filterItems, sort, stringFacets, false, "");
            }
        }

        // Maintain a list of items in the filter in sort order.
        var sortedFilter = [];
        // More compicated for the graphview...
        if (_views[_currentView].GetViewName() == 'Graph View')
           sortedFilter = _views[_currentView].GetSortedFilter();
        else {
            for (var i = 0; i < _views[_currentView].tiles.length; i++) {
                var filterindex = $.inArray(_views[_currentView].tiles[i].facetItem.Id, filterItems);
                if (filterindex >= 0) {
                    var obj = new Object ();
                    obj.Id = _views[_currentView].tiles[i].facetItem.Id;
                    obj.Bucket = 0;
                    sortedFilter.push(obj);
                }
            }
        }
        _filterItems = sortedFilter;

        //Update item count
        UpdateItemCount();

	// Update the bookmark
        UpdateBookmark ();

        DeselectInfoPanel();
    };

    BucketCounts = function (bucketArray, name, itemsArray) {
        for (var i = 0; i < bucketArray.length; i++) {
            var datetimeitem = $('#pv-facet-item-' + CleanName(name) + "__" + CleanName(bucketArray[i].Name.toString()));
            var count = 0;
            for (var j = 0; j < itemsArray.length; j++) {
                if (bucketArray[i].Items.indexOf(itemsArray[j]) != -1) 
                     count++;
            }
            datetimeitem.find('span').last().text(count);
            if (count == 0)
                datetimeitem.hide();
            else
                datetimeitem.show();
        }
    };

    GetDateTimeItemCounts = function (category, filterItems) {
        if (category.decadeBuckets.length > 0) {
            for (var i = 0; i < category.decadeBuckets.length; i++) {
                var datetimeitem = $('#pv-facet-item-' + CleanName(category.Name) + "__" + CleanName(category.decadeBuckets[i].Name.toString()));
                datetimeitem.find('span').last().text(category.decadeBuckets[i].Items.length);
                datetimeitem.show();
            }
        }

        if (category.yearBuckets.length > 0) {
            for (var i = 0; i < category.yearBuckets.length; i++) {
                var datetimeitem = $('#pv-facet-item-' + CleanName(category.Name) + "__" + CleanName(category.yearBuckets[i].Name.toString()));
                datetimeitem.find('span').last().text(category.yearBuckets[i].Items.length);
                datetimeitem.show();
            }
        }

        if (category.monthBuckets.length > 0) {
            for (var i = 0; i < category.monthBuckets.length; i++) {
                var datetimeitem = $('#pv-facet-item-' + CleanName(category.Name) + "__" + CleanName(category.monthBuckets[i].Name.toString()));
                datetimeitem.find('span').last().text(category.monthBuckets[i].Items.length);
                datetimeitem.show();
            }
        }

        if (category.dayBuckets.length > 0) {
            for (var i = 0; i < category.dayBuckets.length; i++) {
                var datetimeitem = $('#pv-facet-item-' + CleanName(category.Name) + "__" + CleanName(category.dayBuckets[i].Name.toString()));
                datetimeitem.find('span').last().text(category.dayBuckets[i].Items.length);
                datetimeitem.show();
            }
        }

        if (category.hourBuckets.length > 0) {
            for (var i = 0; i < category.hourBuckets.length; i++) {
                var datetimeitem = $('#pv-facet-item-' + CleanName(category.Name) + "__" + CleanName(category.hourBuckets[i].Name.toString()));
                datetimeitem.find('span').last().text(category.hourBuckets[i].Items.length);
                datetimeitem.show();
            }
        }

        if (category.minuteBuckets.length > 0) { 
            for (var i = 0; i < category.minuteBuckets.length; i++) {
                var datetimeitem = $('#pv-facet-item-' + CleanName(category.Name) + "__" + CleanName(category.minuteBuckets[i].Name.toString()));
                datetimeitem.find('span').last().text(category.minuteBuckets[i].Items.length);
                datetimeitem.show();
            }
        }

        if (category.secondBuckets.length > 0) { 
            for (var i = 0; i < category.secondBuckets.length; i++) {
                var datetimeitem = $('#pv-facet-item-' + CleanName(category.Name) + "__" + CleanName(category.secondBuckets[i].Name.toString()));
                datetimeitem.find('span').last().text(category.secondBuckets[i].Items.length);
                datetimeitem.show();
            }
        }
    };

    /// Filters the facet panel items and updates the counts
    FilterFacets = function (filterItems, selectedFacets) {
        //if all the items are visible then update all
        if (filterItems.length == PivotCollection.Items.length) {

            //DateTime facets
            for (var i = 0; i < PivotCollection.FacetCategories.length; i++) {
                if (PivotCollection.FacetCategories[i].Type == PivotViewer.Models.FacetType.DateTime)
                    GetDateTimeItemCounts(PivotCollection.FacetCategories[i], filterItems);
            }

            //String facets
            for (var i = _facetItemTotals.length - 1; i > -1; i -= 1) {
                var item = $('#' + PivotViewer.Utils.EscapeMetaChars(_facetItemTotals[i].itemId));
                item.show();
                item.find('span').last().text(_facetItemTotals[i].count);
            }

            //Numeric facets
            //re-create the histograms
            for (var i = 0; i < _facetNumericItemTotals.length; i++)
                CreateNumberFacet(CleanName(_facetNumericItemTotals[i].Facet), _facetNumericItemTotals[i].Values);

            return;
        }

        var filterList = []; //used for string facets
        var numericFilterList = []; //used for number facets
        var datetimeFilterList = []; //used for datetime facets

        //Create list of items to display
        for (var i = filterItems.length - 1; i > -1; i -= 1) {
            var item = PivotCollection.GetItemById(filterItems[i]);
            for (var m = 0; m < PivotCollection.FacetCategories.length; m++) {
                if (PivotCollection.FacetCategories[m].IsFilterVisible) {
                    //If it's a visible filter then determine if it has a value
                    var hasValue = false;
                    for (var j = item.Facets.length - 1; j > -1; j -= 1) {
                        if (item.Facets[j].Name == PivotCollection.FacetCategories[m].Name) {
                            //If not in the selected facet list then determine count
                            if ($.inArray(item.Facets[j].Name, selectedFacets) < 0) {
                                var facetCategory = PivotCollection.GetFacetCategoryByName(item.Facets[j].Name);
                                if (facetCategory.IsFilterVisible) {
                                    for (var k = item.Facets[j].FacetValues.length - 1; k > -1; k -= 1) {
                                        //String Facets
                                        if (facetCategory.Type == PivotViewer.Models.FacetType.String) {
                                            var filteredItem = { item: '#' + PivotViewer.Utils.EscapeMetaChars('pv-facet-item-' + CleanName(item.Facets[j].Name) + '__' + CleanName(item.Facets[j].FacetValues[k].Value)), count: 1 };
                                            var found = false;
                                            for (var n = filterList.length - 1; n > -1; n -= 1) {
                                                if (filterList[n].item == filteredItem.item) {
                                                    filterList[n].count += 1;
                                                    found = true;
                                                    break;
                                                }
                                            }
                                            if (!found)
                                                filterList.push(filteredItem);
                                        }
                                        else if (facetCategory.Type == PivotViewer.Models.FacetType.Number) {
                                            //collect all the numbers to update the histogram
                                            var numFound = false;
                                            for (var n = 0; n < numericFilterList.length; n++) {
                                                if (numericFilterList[n].Facet == item.Facets[j].Name) {
                                                    numericFilterList[n].Values.push(item.Facets[j].FacetValues[k].Value);
                                                    numFound = true;
                                                    break;
                                                }
                                            }
                                            if (!numFound)
                                                numericFilterList.push({ Facet: item.Facets[j].Name, Values: [item.Facets[j].FacetValues[k].Value] });
                                        } // do datetime facets separately....
                                    }
                                }
                            }
                            hasValue = true;
                        }
                    }

                    if (!hasValue) {
                        //increment count for (no info)
                        var filteredItem = { item: '#' + PivotViewer.Utils.EscapeMetaChars('pv-facet-item-' + CleanName(PivotCollection.FacetCategories[m].Name) + '__' + CleanName('(no info)')), count: 1 };
                        var found = false;
                        for (var n = filterList.length - 1; n > -1; n -= 1) {
                            if (filterList[n].item == filteredItem.item) {
                                filterList[n].count += 1;
                                found = true;
                                break;
                            }
                        }
                        if (!found)
                            filterList.push(filteredItem);
                    }
                }
            }
        }

        //String facets
        //iterate over all facet items to set it's visibility and count
        for (var i = _facetItemTotals.length - 1; i > -1; i -= 1) {
            if ($.inArray(_facetItemTotals[i].facet, selectedFacets) < 0) {
                //loop over all and hide those not in filterList	
                var found = false;
                for (var j = filterList.length - 1; j > -1; j -= 1) {
                    if (filterList[j].item == _facetItemTotals[i].itemId) {
                        found = true;
                        break;
                    }
                }
                if (!found)
                    $('#' + PivotViewer.Utils.EscapeMetaChars(_facetItemTotals[i].itemId)).hide();
            } else {
                //Set count for selected facets
                $('#' + PivotViewer.Utils.EscapeMetaChars(_facetItemTotals[i].itemId)).find('span').last().text(_facetItemTotals[i].count);
            }
        }

        //display relevant items
        for (var i = filterList.length - 1; i > -1; i -= 1) {
            var facetItem = $(filterList[i].item);
            if (facetItem.length > 0) {
                facetItem.show();
                var itemCount = facetItem.find('span').last();
                itemCount.text(filterList[i].count);
            }
        }

        //Numeric facets
        //re-create the histograms
        for (var i = 0; i < numericFilterList.length; i++)
            CreateNumberFacet(CleanName(numericFilterList[i].Facet), numericFilterList[i].Values);

        //Datetime facet
        //Find the datetime buckets that we are displaying and set relevant
        //visibility and counts
        for (var i = 0; i < PivotCollection.FacetCategories.length; i++) {
            if ($.inArray(PivotCollection.FacetCategories[i].Name, selectedFacets) < 0) {
                if (PivotCollection.FacetCategories[i].Type == PivotViewer.Models.FacetType.DateTime ) {
                    var category = PivotCollection.FacetCategories[i];
        
                    if (category.decadeBuckets.length > 0 && $('#pv-facet-item-' + CleanName(category.Name) + "__" + CleanName(category.decadeBuckets[0].Name.toString())).css('visibility') != 'hidden') 
                        BucketCounts(category.decadeBuckets, category.Name, filterItems);
                    if (category.yearBuckets.length > 0 && $('#pv-facet-item-' + CleanName(category.Name) + "__" + CleanName(category.yearBuckets[0].Name.toString())).css('visibility') != 'hidden') 
                        BucketCounts(category.yearBuckets, category.Name, filterItems);
                    if (category.monthBuckets.length > 0 && $('#pv-facet-item-' + CleanName(category.Name) + "__" + CleanName(category.monthBuckets[0].Name.toString())).css('visibility') != 'hidden') 
                        BucketCounts(category.monthBuckets, category.Name, filterItems);
                    if (category.dayBuckets.length > 0 && $('#pv-facet-item-' + CleanName(category.Name) + "__" + CleanName(category.dayBuckets[0].Name.toString())).css('visibility') != 'hidden') 
                        BucketCounts(category.dayBuckets, category.Name, filterItems);
                    if (category.hourBuckets.length > 0 && $('#pv-facet-item-' + CleanName(category.Name) + "__" + CleanName(category.hourBuckets[0].Name.toString())).css('visibility') != 'hidden') 
                        BucketCounts(category.hourBuckets, category.Name, filterItems);
                    if (category.minuteBuckets.length > 0 && $('#pv-facet-item-' + CleanName(category.Name) + "__" + CleanName(category.minuteBuckets[0].Name.toString())).css('visibility') != 'hidden') 
                        BucketCounts(category.minuteBuckets, category.Name, filterItems);
                    if (category.secondBuckets.length > 0 && $('#pv-facet-item-' + CleanName(category.Name) + "__" + CleanName(category.secondBuckets[0].Name.toString())).css('visibility') != 'hidden') 
                        BucketCounts(category.secondBuckets, category.Name, filterItems);
                }
            }
        }
    };

    UpdateBreadcrumbNavigation = function (stringFacets, numericFacets, datetimeFacets) {
        var bc = $('.pv-toolbarpanel-facetbreadcrumb');
        bc.empty();

        if (stringFacets.length == 0 && numericFacets.length == 0 && datetimeFacets.length == 0)
            return;

        var bcItems = "|";
        for (var i = 0, _iLen = stringFacets.length; i < _iLen; i++) {
            bcItems += "<span class='pv-toolbarpanel-facetbreadcrumb-facet'>" + stringFacets[i].facet + ":</span><span class='pv-toolbarpanel-facetbreadcrumb-values'>"
            bcItems += stringFacets[i].facetValue.join(', ');
            bcItems += "</span><span class='pv-toolbarpanel-facetbreadcrumb-separator'>&gt;</span>";
        }

        for (var i = 0, _iLen = numericFacets.length; i < _iLen; i++) {
            bcItems += "<span class='pv-toolbarpanel-facetbreadcrumb-facet'>" + numericFacets[i].facet + ":</span><span class='pv-toolbarpanel-facetbreadcrumb-values'>"
            if (numericFacets[i].selectedMin == numericFacets[i].rangeMin)
                bcItems += "Under " + numericFacets[i].selectedMax;
            else if (numericFacets[i].selectedMax == numericFacets[i].rangeMax)
                bcItems += "Over " + numericFacets[i].selectedMin;
            else
                bcItems += numericFacets[i].selectedMin + " - " + numericFacets[i].selectedMax;
            bcItems += "</span><span class='pv-toolbarpanel-facetbreadcrumb-separator'>&gt;</span>";
        }

        for (var i = 0, _iLen = datetimeFacets.length; i < _iLen; i++) {
            if (datetimeFacets[i].maxDate && datetimeFacets[i].minDate) {
                bcItems += "<span class='pv-toolbarpanel-facetbreadcrumb-facet'>" + datetimeFacets[i].facet + ":</span><span class='pv-toolbarpanel-facetbreadcrumb-values'>"
                bcItems += "Between " + datetimeFacets[i].minDate + " and " + datetimeFacets[i].maxDate;
                bcItems += "</span><span class='pv-toolbarpanel-facetbreadcrumb-separator'>&gt;</span>";
            } else {
                bcItems += "<span class='pv-toolbarpanel-facetbreadcrumb-facet'>" + datetimeFacets[i].facet + ":</span><span class='pv-toolbarpanel-facetbreadcrumb-values'>"
                bcItems += datetimeFacets[i].facetValue.join(', ');
                bcItems += "</span><span class='pv-toolbarpanel-facetbreadcrumb-separator'>&gt;</span>";
            }
        }
        bc.append(bcItems);
    };

    UpdateItemCount = function(){
        var $itemCount = $('.pv-toolbarpanel-itemcount');
        $itemCount.empty();
        $itemCount.append(_filterItems.length);
    };

    DeselectInfoPanel = function () {
        //de-select details
        $('.pv-infopanel').fadeOut();
        $('.pv-infopanel-heading').empty();
        $('.pv-infopanel-details').empty();
    };

    UpdateBookmark = function ()
        {
            // CurrentViewerState
            var currentViewerState = "#";

            // Add the ViewerState fragment
	    // Add view
	    var viewNum = _currentView + 1;
	    currentViewerState += "$view$=" + viewNum;
	    // Add sort facet
	    if ( _currentSort )
	    	currentViewerState += "&$facet0$=" + _currentSort;
	    // Add selection
	    if ( _selectedItem )
	    	currentViewerState += "&$selection$=" + _selectedItem.Id;
            // Handle bookmark params for specific views
            if (_currentView == 2)
                if (_views[_currentView].GetSelectedFacet())
	    	  currentViewerState += "&$tableFacet$=" + _views[_currentView].GetSelectedFacet();
            if (_currentView == 3) {
                if (_views[_currentView].GetMapCentreX())
	    	  currentViewerState += "&$mapCentreX$=" + _views[_currentView].GetMapCentreX();
                if (_views[_currentView].GetMapCentreY())
	    	  currentViewerState += "&$mapCentreY$=" + _views[_currentView].GetMapCentreY();
                if (_views[_currentView].GetMapType())
	    	  currentViewerState += "&$mapType$=" + _views[_currentView].GetMapType();
                if (_views[_currentView].GetMapZoom())
	    	  currentViewerState += "&$mapZoom$=" + _views[_currentView].GetMapZoom();
            }
            if (_currentView == 4) 
                if (_views[_currentView].GetSelectedFacet())
	    	  currentViewerState += "&$timelineFacet$=" + _views[_currentView].GetSelectedFacet();
	    // Add filters and create title
            var title = PivotCollection.CollectionName;
            if (_numericFacets.length + _stringFacets.length > 0)
                title = title + " | ";

	    if (_stringFacets.length > 0 ) {
		for ( i = 0; i < _stringFacets.length; i++ ) {
			for ( j = 0; j < _stringFacets[i].facetValue.length; j++ ) {
	        	    currentViewerState += "&";
			    currentViewerState += _stringFacets[i].facet;
			    currentViewerState += "=EQ." + _stringFacets[i].facetValue[j];
			}
			title += _stringFacets[i].facet + ": ";
			title += _stringFacets[i].facetValue.join(', ');;
			if ( i < _stringFacets.length - 1)
			    title += " > "
	        }
	    }
	    if (_numericFacets.length > 0 ) {
		for ( i = 0; i < _numericFacets.length; i++ ) {
	        	currentViewerState += "&";
			currentViewerState += _numericFacets[i].facet;
			title += _numericFacets[i].facet + ": ";
			if (_numericFacets[i].selectedMin == _numericFacets[i].rangeMin) {
			    currentViewerState += "=LE." + _numericFacets[i].selectedMax;
			    title += "Under " + _numericFacets[i].selectedMax;
			} else if (_numericFacets[i].selectedMax == _numericFacets[i].rangeMax) {
			    currentViewerState += "=GE." + _numericFacets[i].selectedMin;
			    title += "Over " + _numericFacets[i].selectedMin;
			} else {
			    currentViewerState += "=GE." + _numericFacets[i].selectedMin + "_LE." + _numericFacets[i].selectedMax;
			    title += "Between " + _numericFacets[i].selectedMin + " and " + _numericFacets[i].selectedMax;
			}
			if ( i < _numericFacets.length - 1)
			    title += " > "
	        }
	    }
	    if (_datetimeFacets.length > 0 ) {
		for ( i = 0; i < _datetimeFacets.length; i++ ) {
			for ( j = 0; j < _datetimeFacets[i].facetValue.length; j++ ) {
	        	    currentViewerState += "&";
			    currentViewerState += _datetimeFacets[i].facet;
			    title += _datetimeFacets[i].facet + ": ";
                            if (_datetimeFacets[i].maxDate && _datetimeFacets[i].minDate) {
			        currentViewerState += "=GE." + _datetimeFacets[i].minDate + "_LE." + _datetimeFacets[i].maxDate;
			        title += "Between " + _datetimeFacets[i].minDate + " and " + _datetimeFacets[i].maxDate;
                            } else {
			        currentViewerState += "=EQ." + _datetimeFacets[i].facetValue[j];
			        title += _datetimeFacets[i].facetValue.join(', ');
			    }
			}
			if ( i < _datetimeFacets.length - 1)
			    title += " > "
	        }
	    }

            // Permalink bookmarks can be enabled by implementing a function 
            // SetBookmark(bookmark string, title string)  
            if ( typeof (SetBookmark) != undefined && typeof(SetBookmark) === "function") { 
                SetBookmark( PivotCollection.CXMLBaseNoProxy, currentViewerState, title);
            }
        };

    CleanName = function (uncleanName) {
        name = uncleanName.replace(/[^\w]/gi, '_');
        _nameMapping[name] = uncleanName;      
        return name;
    }

    //Events
    //Collection loading complete
    $.subscribe("/PivotViewer/Models/Collection/Loaded", function (event) {
        InitTileCollection();
    });

    //Image Collection loading complete
    $.subscribe("/PivotViewer/ImageController/Collection/Loaded", function (event) {
        InitPivotViewer();
    });

    //Item selected - show the info panel
    $.subscribe("/PivotViewer/Views/Item/Selected", function (evt) {

        if (evt.id === undefined || evt.id === null || evt.id === "") {
            DeselectInfoPanel();
            _selectedItem = "";
            if (_currentView == 2)
                _views[_currentView].Selected(_selectedItem.Id); 
	    // Update the bookmark
            UpdateBookmark ();
            return;
        }

        //if (evt.length > 0) {
        var selectedItem = PivotCollection.GetItemById(evt.id);
        if (selectedItem != null) {
            // nav arrows...
            if (selectedItem.Id == _filterItems[0].Id && selectedItem == _filterItems[_filterItems.length - 1]) {
                $('.pv-infopanel-controls-navright').hide();
                $('.pv-infopanel-controls-navrightdisabled').show();
                $('.pv-infopanel-controls-navleft').hide();
                $('.pv-infopanel-controls-navleftdisabled').show();
            } else if (selectedItem.Id == _filterItems[0].Id) {
                $('.pv-infopanel-controls-navleft').hide();
                $('.pv-infopanel-controls-navleftdisabled').show();
                $('.pv-infopanel-controls-navright').show();
                $('.pv-infopanel-controls-navrightdisabled').hide();
            } else if (selectedItem.Id == _filterItems[_filterItems.length - 1].Id) {
                $('.pv-infopanel-controls-navright').hide();
                $('.pv-infopanel-controls-navrightdisabled').show();
                $('.pv-infopanel-controls-navleft').show();
                $('.pv-infopanel-controls-navleftdisabled').hide();
            } else {
                $('.pv-infopanel-controls-navright').show();
                $('.pv-infopanel-controls-navrightdisabled').hide();
                $('.pv-infopanel-controls-navleft').show();
                $('.pv-infopanel-controls-navleftdisabled').hide();
            }

			var alternate = true;
            for (var i = 0; i < selectedItem.Facets.length; i++) {
                //check for IsMetaDataVisible
                var IsMetaDataVisible = false;
                var IsFilterVisible = false;
                for (var j = 0; j < PivotCollection.FacetCategories.length; j++) {
                    if (PivotCollection.FacetCategories[j].Name == selectedItem.Facets[i].Name && PivotCollection.FacetCategories[j].IsMetaDataVisible) {
                        IsMetaDataVisible = true;
                        IsFilterVisible = PivotCollection.FacetCategories[j].IsFilterVisible;
                        break;
                    }
                }
				
				selectedItem.Facets[i].IsMetaDataVisible = IsMetaDataVisible;
				selectedItem.Facets[i].IsFilterVisible = IsFilterVisible; // FIXME need paths in mustache - switch to handlebars?
				selectedItem.Facets[i].alternate = alternate;
				alternate = !alternate;
			}
			
            var infopanelDetails = $('#pv-infopanel-body');
            infopanelDetails.empty();			
            infopanelDetails.append(ich.pv_template_infopanel_details(selectedItem));
            infopanelDetails.css('height', ($('.pv-infopanel').height() - ($('.pv-infopanel-controls').height() + $('.pv-infopanel-heading').height() + $('.pv-infopanel-copyright').height() + $('.pv-infopanel-related').height()) - 20) + 'px');			
			
            $('.pv-infopanel').fadeIn();

            _selectedItem = selectedItem;
            _selectedItemBkt = evt.bkt;

            if (_currentView == 2 || _currentView == 4)
                _views[_currentView].Selected(_selectedItem.Id); 
            if (_currentView == 3) 
                _views[_currentView].RedrawMarkers(_selectedItem.Id); 

	    // Update the bookmark
            UpdateBookmark ();

            return;
        }

    });

    //Filter the facet list
    $.subscribe("/PivotViewer/Views/Item/Filtered", function (evt) {
        if (evt == undefined || evt == null)
            return;

        // If the facet used for the sort is the same as the facet that the filter is 
        // changing on then clear all the other values?
        // This is only the case when comming from drill down in the graph view.
        if (evt.ClearFacetFilters == true) {
            for (var i = 0, _iLen = PivotCollection.FacetCategories.length; i < _iLen; i++) {
                if (PivotCollection.FacetCategories[i].Name == evt.Facet && 
                    (PivotCollection.FacetCategories[i].Type == PivotViewer.Models.FacetType.String ||
                    PivotCollection.FacetCategories[i].Type == PivotViewer.Models.FacetType.DateTime)) {
                    var checkedValues = $('.pv-facet-facetitem[itemfacet="' + CleanName(evt.Facet.toString()) + '"]')
                    for (var j = 0; j < checkedValues.length; j++) {
                        $(checkedValues[j]).prop('checked', false);
                    }
                }
            }
        }

        for (var i = 0, _iLen = PivotCollection.FacetCategories.length; i < _iLen; i++) {
            if (PivotCollection.FacetCategories[i].Name == evt.Facet && 
                (PivotCollection.FacetCategories[i].Type == PivotViewer.Models.FacetType.String ||
                PivotCollection.FacetCategories[i].Type == PivotViewer.Models.FacetType.DateTime)) {

                if (evt.Values) {
	            for ( var j = 0; j < evt.Values.length; j++) {
                        var cb = $(PivotViewer.Utils.EscapeMetaChars("#pv-facet-item-" + CleanName(evt.Facet.toString()) + "__" + CleanName(evt.Values[j].toString())) + " input");
                        cb.prop('checked', true);
                        FacetItemClick(cb[0]);
                    }
                } else {
                    var cb = $(PivotViewer.Utils.EscapeMetaChars("#pv-facet-item-" + CleanName(evt.Facet.toString()) + "__" + CleanName(evt.Item.toString())) + " input");
                    cb.prop('checked', true);
                    FacetItemClick(cb[0]);
                }
            }
            if (PivotCollection.FacetCategories[i].Name == evt.Facet && 
                PivotCollection.FacetCategories[i].Type == PivotViewer.Models.FacetType.Number) {
                var s = $('#pv-filterpanel-numericslider-' + CleanName(evt.Facet));
                FacetSliderDrag(s, evt.Item, evt.MaxRange);
            }
        }
    });

    //Trigger a bookmark update
    $.subscribe("/PivotViewer/Views/Item/Updated", function () {
        UpdateBookmark ();
    });
 
    //Changing to grid view
    $.subscribe("/PivotViewer/Views/ChangeTo/Grid", function (evt) {
        var selectedTile = "";
        for ( t = 0; t < _tiles.length; t ++ ) {
            if (_tiles[t].facetItem == evt.Item) {
               selectedTile = _tiles[t];
               break;
            }
        }
        if (selectedTile)
             $.publish("/PivotViewer/Views/Canvas/Click", [{ x: selectedTile._locations[selectedTile.selectedLoc].destinationx + selectedTile.destinationwidth/2, y: selectedTile._locations[selectedTile.selectedLoc].destinationy + selectedTile.destinationheight/2}]);
    });

    $.subscribe("/PivotViewer/Views/Update/GridSelection", function (evt) {
        _views[0].handleSelection(evt.selectedItem, evt.selectedTile); 
    });

    AttachEventHandlers = function () {
        //Event Handlers
        //View click
        $('.pv-toolbarpanel-view').on('click', function (e) {
            var viewId = this.id.substring(this.id.lastIndexOf('-') + 1, this.id.length);
            if (viewId != null)
                SelectView(parseInt(viewId), false);
        });
        //Sort change
        $('.pv-toolbarpanel-sort').on('change', function (e) {
	    _currentSort = $('.pv-toolbarpanel-sort option:selected').attr('label');
            Debug.Log('sort change _currentSort ' + _currentSort );
            FilterCollection(false);
        });
        //Facet sort
        $('.pv-filterpanel-accordion-facet-sort').on('click', function (e) {
            var sortDiv = $(this);
            var sortText = sortDiv.text();
            var facetName = sortDiv.parent().prev().children('a').text();
            var customSort = sortDiv.attr("customSort");
            if (sortText == "Sort: A-Z")
                $(this).text("Sort: Quantity");
            else if (sortText == "Sort: Quantity" && customSort == undefined)
                $(this).text("Sort: A-Z");
            else if (sortText == "Sort: Quantity")
                $(this).text("Sort: " + customSort);
            else
                $(this).text("Sort: A-Z");

            SortFacetItems(facetName);
        });
        //Facet item checkbox click
        $('.pv-facet-facetitem').on('click', function (e) {
            FacetItemClick(this);
        });
        //Facet item label click
        $('.pv-facet-facetitem-label').on('click', function (e) {
            var cb = $(this).prev();
            var checked = $(this.parentElement.parentElement).find(':checked');

            if (cb.prop('checked') == true && checked.length <= 1)
                cb.prop('checked', false);
            else
                cb.prop('checked', true);

            for (var i = checked.length - 1; i > -1; i -= 1) {
                if (checked[i].getAttribute('itemvalue') != cb[0].getAttribute('itemvalue'))
                    checked[i].checked = false;
            }
            FacetItemClick(cb[0]);
        });
        //Export data click - gets the current filter and outputs it to a new window so it can be copied into another application
        $('.pv-filterpanel-export').on('click', function (e) {
            //get current selection and generate output HTML.
            output = '<html>';
            output += '<head><title>Export current filter.</title></head>'
            output += '<body><table><tr><th>Name</th>'
            //add columns for facet categories
            for (var m = 0; m < PivotCollection.FacetCategories.length; m++) {
                output += '<th>' + PivotCollection.FacetCategories[m].Name + '</th>';
            }

            //add rows for each selected item
            for(var i = 0; i < _filterItems.length; i++){
                for (var j = 0; j < _tiles.length; j++) {
                    //find item from filter
                    if (_tiles[j].facetItem.Id == _filterItems[i].Id) {
                        var item = _tiles[j];
                        //add the items name as the first column
                        output += '<tr><td>' + item.facetItem.Name + '</td>';
                        //add the other columns
                        for (var m = 0; m < PivotCollection.FacetCategories.length; m++) {
                            var value = '';
                            for(var t = 0; t < item.facetItem.Facets.length; t++){
                                //if then facet category names match then set the value
                                if(item.facetItem.Facets[t].Name == PivotCollection.FacetCategories[m].Name){
                                    var values = [];
                                    for(var v = 0; v < item.facetItem.Facets[t].FacetValues.length; v++){
                                        if(typeof item.facetItem.Facets[t].FacetValues[v].Value != 'undefined') 
                                            values.push(item.facetItem.Facets[t].FacetValues[v].Value);
                                    }
                                    //output the values as a comma delimited list
                                    value = values.join();
                                    break;
                                }
                            }
                            output += '<td>' + value + '</td>';
                        }
                        output += '</tr>';
                    }
                }
            }

            output += '</tr></table></body></html>';
            //open a new window and write the contents
            var win = window.open('', '_blank');
            win.document.write(output);
            win.document.close();
        });
        //Facet clear all click
        $('.pv-filterpanel-clearall').on('click', function (e) {
            //deselect all String Facets
            var checked = $('.pv-facet-facetitem:checked');
            for (var i = 0; i < checked.length; i++) {
                $(checked[i]).prop('checked', false);
                if ($(checked[i]).attr('itemvalue') == "CustomRange") 
                    HideCustomDateRange($(checked[i]).attr('itemfacet'));
            }
            //Reset all Numeric Facets
            var sliders = $('.pv-filterpanel-numericslider');
            for (var i = 0; i < sliders.length; i++) {
                var slider = $(sliders[i]);
                var thisMin = slider.slider('option', 'min'),
                    thisMax = slider.slider('option', 'max');
                slider.slider('values', 0, thisMin);
                slider.slider('values', 1, thisMax);
                slider.prev().prev().html('&nbsp;');
            }
            //Clear search box
            $('.pv-filterpanel-search').val('');
            //turn off clear buttons
            $('.pv-filterpanel-accordion-heading-clear').css('visibility', 'hidden');
            FilterCollection(false);
        });
        //Facet clear click
        $('.pv-filterpanel-accordion-heading-clear').on('click', function (e) {
            //Get facet type
            var facetType = this.attributes['facetType'].value;
	    if (facetType == "DateTime") {
                //get selected items in current group
                var checked = $(this.parentElement).next().find('.pv-facet-facetitem:checked');
                for (var i = 0; i < checked.length; i++) {
                    $(checked[i]).prop('checked', false);
                    HideCustomDateRange($(checked[i]).attr('itemfacet'));
                }
            } else if (facetType == "String") {
                //get selected items in current group
                var checked = $(this.parentElement).next().find('.pv-facet-facetitem:checked');
                for (var i = 0; i < checked.length; i++) {
                    $(checked[i]).prop('checked', false);
                }
            } else if (facetType == "Number") {
                //reset range
                var slider = $(this.parentElement).next().find('.pv-filterpanel-numericslider');
                var thisMin = slider.slider('option', 'min'),
                    thisMax = slider.slider('option', 'max');
                slider.slider('values', 0, thisMin);
                slider.slider('values', 1, thisMax);
                slider.prev().prev().html('&nbsp;');
            }
            FilterCollection(false);
            $(this).css('visibility', 'hidden');
        });
        //Numeric facet type slider drag
        $('.ui-slider-range').on('mousedown', function (e) {
            //drag it
        });
        //Datetime Facet Custom Range Text input changed
        $('.pv-facet-customrange').on('change', function (e) {
            CustomRangeChanged(this);
        });
        //Info panel
        $('.pv-infopanel-details').on('click', '.detail-item-value-filter', function (e) {
            $.publish("/PivotViewer/Views/Item/Filtered", [{ Facet: $(this).parent().children().attr('pv-detail-item-title'), Item: this.getAttribute('pv-detail-item-value'), Values: null, ClearFacetFilters: true }]);
            return false;
        });
        $('.pv-infopanel-details').on('click', '.pv-infopanel-detail-description-more', function (e) {
            var that = $(this);
            var details = $(this).prev();
            if (that.text() == "More") {
                details.css('height', '');
                $(this).text('Less');
            } else {
                details.css('height', '100px');
                $(this).text('More');
            }
        });
        $('.pv-infopanel-controls-navleft').on('click', function (e) {
          for (var i = 0; i < _filterItems.length; i++) {
              if (_filterItems[i].Id == _selectedItem.Id && _filterItems[i].Bucket == _selectedItemBkt){
                  if (i >= 0)
                      $.publish("/PivotViewer/Views/Item/Selected", [{id: _filterItems[i - 1].Id, bkt: _filterItems[i - 1].Bucket}]);
                      //jch need to move the images
                      if (_currentView == 0 || _currentView == 1) { 
                          for (var j = 0; j < _tiles.length; j++) {
                              if (_tiles[j].facetItem.Id == _filterItems[i - 1].Id) {
                                    _tiles[j].Selected(true);
                                    selectedCol = _views[_currentView].GetSelectedCol(_tiles[j], _filterItems[i - 1].Bucket);
                                    selectedRow = _views[_currentView].GetSelectedRow(_tiles[j], _filterItems[i - 1].Bucket);
                                    _views[_currentView].CentreOnSelectedTile(selectedCol, selectedRow);
                              } else {
                                    _tiles[j].Selected(false);
                              }
                          }
                      }
                  break;
              }
          }
        });
        $('.pv-infopanel-controls-navright').on('click', function (e) {
          for (var i = 0; i < _filterItems.length; i++) {
              if (_filterItems[i].Id == _selectedItem.Id && _filterItems[i].Bucket == _selectedItemBkt){
                  if (i < _filterItems.length) {
                      $.publish("/PivotViewer/Views/Item/Selected", [{id: _filterItems[i + 1].Id, bkt: _filterItems[i + 1].Bucket}]);
                      //jch need to move the images
                      if (_currentView == 0 || _currentView == 1) { 
                          for (var j = 0; j < _tiles.length; j++) {
                              if (_tiles[j].facetItem.Id == _filterItems[i + 1].Id) {
                                    _tiles[j].Selected(true);
                                    selectedCol = _views[_currentView].GetSelectedCol(_tiles[j], _filterItems[i + 1].Bucket);
                                    selectedRow = _views[_currentView].GetSelectedRow(_tiles[j], _filterItems[i + 1].Bucket);
                                    _views[_currentView].CentreOnSelectedTile(selectedCol, selectedRow);
                              } else {
                                    _tiles[j].Selected(false);
                              }
                          }
                      }
                  }
                  break;
              }
          }
        });
        //Search
        $('.pv-filterpanel-search').on('keyup', function (e) {
            var found = false;
            var foundAlready = [];
            var autocomplete = $('.pv-filterpanel-search-autocomplete');
            var filterRef = FilterCollection;
            var selectRef = SelectStringFacetItem;
            autocomplete.empty();

            //Esc
            if (e.keyCode == 27) {
                $(e.target).blur(); //remove focus
                return;
            }

            for (var i = 0, _iLen = _wordWheelItems.length; i < _iLen; i++) {
                var wwi = _wordWheelItems[i].Value.toLowerCase();
                if (wwi.indexOf(e.target.value.toLowerCase()) >= 0) {
                    if ($.inArray(wwi, foundAlready) == -1) {
                        foundAlready.push(wwi);
                        //Add to autocomplete
                        autocomplete.append('<span facet="' + _wordWheelItems[i].Facet + '">' + _wordWheelItems[i].Value + '</span>');

                        if (e.keyCode == 13) {
                            SelectStringFacetItem(
                                CleanName(_wordWheelItems[i].Facet),
                                CleanName(_wordWheelItems[i].Value)
                            );
                            found = true;
                        }
                    }
                }
            }

            $('.pv-filterpanel-search-autocomplete > span').on('mousedown', function (e) {
                e.preventDefault();
                $('.pv-filterpanel-search').val(e.target.textContent);
                $('.pv-filterpanel-search-autocomplete').hide();
                selectRef(
                    CleanName(e.target.attributes[0].value),
                    CleanName(e.target.textContent)
                );
                filterRef();
            });

            if (foundAlready.length > 0)
                autocomplete.show();

            if (found)
                FilterCollection(false);
        });
        $('.pv-filterpanel-search').on('blur', function (e) {
            e.target.value = '';
            $('.pv-filterpanel-search-autocomplete').hide();
        });
        //Shared canvas events
        var canvas = $('.pv-viewarea-canvas');
        //mouseup event - used to detect item selection, or drag end
        canvas.on('mouseup', function (evt) {
            var offset = $(this).offset();
            var offsetX = evt.clientX - offset.left;
            var offsetY = evt.clientY - offset.top;
            if (!_mouseMove || (_mouseMove.x == 0 && _mouseMove.y == 0))
                $.publish("/PivotViewer/Views/Canvas/Click", [{ x: offsetX, y: offsetY}]);
            _mouseDrag = null;
            _mouseMove = false;
        });
        //mouseout event
        canvas.on('mouseout', function (evt) {
            _mouseDrag = null;
            _mouseMove = false;
        });
        //mousedown - used to detect drag
        canvas.on('mousedown', function (evt) {
            var offset = $(this).offset();
            var offsetX = evt.clientX - offset.left;
            var offsetY = evt.clientY - offset.top;
            _mouseDrag = { x: offsetX, y: offsetY };
        });
        //mousemove - used to detect drag
        canvas.on('mousemove', function (evt) {
            var offset = $(this).offset();
            var offsetX = evt.clientX - offset.left;
            var offsetY = evt.clientY - offset.top;

            if (_mouseDrag == null)
                $.publish("/PivotViewer/Views/Canvas/Hover", [{ x: offsetX, y: offsetY}]);
            else {
                _mouseMove = { x: offsetX - _mouseDrag.x, y: offsetY - _mouseDrag.y };
                _mouseDrag = { x: offsetX, y: offsetY };
                $.publish("/PivotViewer/Views/Canvas/Drag", [_mouseMove]);
            }
        });
        //mousewheel - used for zoom
        canvas.on('mousewheel', function (evt, delta) {
            var offset = $(this).offset();
            var offsetX = evt.clientX - offset.left;
            var offsetY = evt.clientY - offset.top;
            //zoom easing different from filter
            _tileController.SetQuarticEasingOut();

            //Draw helper
            _tileController.DrawHelpers([{ x: offsetX, y: offsetY}]);

            var value = $('.pv-toolbarpanel-zoomslider').slider('option', 'value');
            if (delta > 0) { value = (value < 5 ) ? 5 : value + 5; }
            else if (delta < 0) { value = value - 5; }
 
            // Ensure that its limited between 0 and 20
            value = Math.max(0, Math.min(100, value));
            $('.pv-toolbarpanel-zoomslider').slider('option', 'value', value);
        });
        //http://stackoverflow.com/questions/6458571/javascript-zoom-and-rotate-using-gesturechange-and-gestureend
        canvas.on("touchstart", function (evt) {
            var orig = evt.originalEvent;

            var offset = $(this).offset();
            var offsetX = orig.touches[0].pageX - offset.left;
            var offsetY = orig.touches[0].pageY - offset.top;
            _mouseDrag = { x: offsetX, y: offsetY };
        });
        canvas.on("touchmove", function (evt) {
            try {
                var orig = evt.originalEvent;
                evt.preventDefault();

                //pinch
                if (orig.touches.length > 1) {
                    evt.preventDefault();
                    //Get centre of pinch
                    var minX = 10000000, minY = 10000000;
                    var maxX = 0, maxY = 0;
                    var helpers = [];
                    for (var i = 0; i < orig.touches.length; i++) {
                        helpers.push({ x: orig.touches[i].pageX, y: orig.touches[i].pageY });
                        if (orig.touches[i].pageX < minX)
                            minX = orig.touches[i].pageX;
                        if (orig.touches[i].pageX > maxX)
                            maxX = orig.touches[i].pageX;
                        if (orig.touches[i].pageY < minY)
                            minY = orig.touches[i].pageY;
                        if (orig.touches[i].pageY > maxY)
                            maxY = orig.touches[i].pageY;
                    }
                    var avgX = (minX + maxX) / 2;
                    var avgY = (minY + maxY) / 2;
                    //var delta = orig.scale < 1 ? -1 : 1;
                    _tileController.SetLinearEasingBoth();

                    helpers.push({ x: avgX, y: avgY });
                    _tileController.DrawHelpers(helpers);
                    _tileController.DrawHelperText("Scale: " + orig.scale);
                    $.publish("/PivotViewer/Views/Canvas/Zoom", [{ x: avgX, y: avgY, scale: orig.scale}]);
                    //$.publish("/PivotViewer/Views/Canvas/Zoom", [{ x: avgX, y: avgY, delta: orig.scale - 1}]);
                    return;
                } else {
                    var offset = $(this).offset();
                    var offsetX = orig.touches[0].pageX - offset.left;
                    var offsetY = orig.touches[0].pageY - offset.top;

                    _mouseMove = { x: offsetX - _mouseDrag.x, y: offsetY - _mouseDrag.y };
                    _mouseDrag = { x: offsetX, y: offsetY };
                    $.publish("/PivotViewer/Views/Canvas/Drag", [_mouseMove]);
                }
            }
            catch (err) { Debug.Log(err.message); }
        });
        canvas.on("touchend", function (evt) {
            var orig = evt.originalEvent;
            //Item selected
            if (orig.touches.length == 1 && _mouseDrag == null) {
                var offset = $(this).offset();
                var offsetX = orig.touches[0].pageX - offset.left;
                var offsetY = orig.touches[0].pageY - offset.top;
                if (!_mouseMove || (_mouseMove.x == 0 && _mouseMove.y == 0))
                    $.publish("/PivotViewer/Views/Canvas/Click", [{ x: offsetX, y: offsetY}]);
            }
            _mouseDrag = null;
            _mouseMove = false;
            return;
        });
    };

    FacetItemClick = function (checkbox) {
        if ($(checkbox).prop('checked') == true) {
            $(checkbox.parentElement.parentElement.parentElement).prev().find('.pv-filterpanel-accordion-heading-clear').css('visibility', 'visible');
            if ($(checkbox).attr('itemvalue') == "CustomRange"){
                GetCustomDateRange($(checkbox).attr('itemfacet'));
                return;
            }
        } else if ($(checkbox).prop('checked') == false && $(checkbox).attr('itemvalue') == "CustomRange")
                HideCustomDateRange($(checkbox).attr('itemfacet'));
        FilterCollection(false);
    };

    FacetSliderDrag = function (slider, min, max) {
        var thisWrapped = $(slider);
        var thisMin = thisWrapped.slider('option', 'min'),
                    thisMax = thisWrapped.slider('option', 'max');
        // Treat no info as like 0 (bit dodgy fix later)
        if (min == "(no info)") min = 0;
        if (min > thisMin || max < thisMax) {
            thisWrapped.parent().find('.pv-filterpanel-numericslider-range-val').text(min + " - " + max);
            thisWrapped.slider('values', 0, min);
            thisWrapped.slider('values', 1, max);
            thisWrapped.parent().parent().prev().find('.pv-filterpanel-accordion-heading-clear').css('visibility', 'visible');
        }
        else if (min == thisMin && max == thisMax)
            thisWrapped.parent().parent().prev().find('.pv-filterpanel-accordion-heading-clear').css('visibility', 'hidden');
        FilterCollection(false);
    };

    Bucketize = function (bucketName, valueArray, itemId, bucketStartDate) {
        var found = false;

        if (valueArray.length == 0) {
            var datetimeinfo = new PivotViewer.Models.DateTimeInfo(bucketName, bucketStartDate);
            valueArray[0] = datetimeinfo;
            valueArray[0].Items.push(itemId);
        } else { 
            for (var d = 0; d < valueArray.length; d++) {
                if (valueArray[d].Name == bucketName) { 
                    valueArray[d].Items.push(itemId);
                    found = true;
                }
            }
            if (!found) {
                    var datetimeinfo = new PivotViewer.Models.DateTimeInfo(bucketName, bucketStartDate);
                    datetimeinfo.Items.push(itemId);
                    valueArray.push(datetimeinfo);
            }
        }
    };

    CreateDatetimeBuckets = function () {
        var months = new Array(12);
        months[0] = "January";
        months[1] = "February";
        months[2] = "March";
        months[3] = "April";
        months[4] = "May";
        months[5] = "June";
        months[6] = "July";
        months[7] = "August";
        months[8] = "September";
        months[9] = "October";
        months[10] = "November";
        months[11] = "December";

        //Find the datetime facets
        for (var i = 0; i < PivotCollection.FacetCategories.length; i++) {
            var currentFacetCategory = PivotCollection.FacetCategories[i];

            // If facet category is a datetime then sort the items into buckets
            if (currentFacetCategory.Type == PivotViewer.Models.FacetType.DateTime) {
                for (var j = 0; j < PivotCollection.Items.length; j++) {
                   var value;
                   var currentItem = PivotCollection.Items[j];
                   for (var k = 0; k < currentItem.Facets.length; k++) {
                       if (currentItem.Facets[k].Name == currentFacetCategory.Name) {
                           value = currentItem.Facets[k].FacetValues[0];
                           var dateValue = new Date(value.Value);
                       
                           // get date and time parts...
                           var year = dateValue.getFullYear();
                           Bucketize (year, currentFacetCategory.yearBuckets, currentItem.Id, new Date(year, 0, 0)); 
                   
                           var decade = year - (year % 10);
                           Bucketize (decade + "s", currentFacetCategory.decadeBuckets, currentItem.Id, new Date(year, 0, 0)); 
                   
                           var month = dateValue.getMonth();
                           Bucketize (months[month] + ", " +  year, currentFacetCategory.monthBuckets, currentItem.Id, new Date(year, month, 0)); 
                   
                           var day = dateValue.getDate();
                           Bucketize (months[month] + " " + day + ", " +  year, currentFacetCategory.dayBuckets, currentItem.Id, new Date(year, month, day)); 
                   
                           var hours = dateValue.getHours();
                           var hourname = (hours > 12) ? hours - 12 + " pm" : hours + " am";
                           Bucketize (months[month] + " " + day + ", " +  year + " " + hourname, currentFacetCategory.hourBuckets, currentItem.Id, new Date(year, month, day, hours, 0, 0)); 
                   
                           var mins = dateValue.getMinutes();
                           Bucketize (months[month] + " " + day + ", " +  year + " " + hours + ":" + mins, currentFacetCategory.minuteBuckets, currentItem.Id, new Date(year, month, day, hours, mins, 0)); 
                   
                           var secs = dateValue.getSeconds();
                           Bucketize (months[month] + " " + day + ", " +  year + " " + hours + ":" + mins + ":" + secs, currentFacetCategory.secondBuckets, currentItem.Id, new Date(year, month, day, hours, mins, secs)); 

                           break;
                       }
                   }
                }
            }
            currentFacetCategory.decadeBuckets.sort(function (a, b) {return a.StartDate - b.StartDate});
            currentFacetCategory.yearBuckets.sort(function (a, b) {return a.StartDate - b.StartDate});
            currentFacetCategory.monthBuckets.sort(function (a, b) {return a.StartDate - b.StartDate});
            currentFacetCategory.dayBuckets.sort(function (a, b) {return a.StartDate - b.StartDate});
            currentFacetCategory.hourBuckets.sort(function (a, b) {return a.StartDate - b.StartDate});
            currentFacetCategory.minuteBuckets.sort(function (a, b) {return a.StartDate - b.StartDate});
            currentFacetCategory.secondBuckets.sort(function (a, b) {return a.StartDate - b.StartDate});
        }
    };

    HideCustomDateRange = function (facetName) {
        $('#pv-custom-range-' + facetName + '__Start').css('visibility', 'hidden'); 
        $('#pv-custom-range-' + facetName + '__Finish').css('visibility', 'hidden'); 
        $('#pv-custom-range-' + facetName + '__StartDate').datepicker("setDate", null);
        $('#pv-custom-range-' + facetName + '__FinishDate').datepicker("setDate", null);
        $('#pv-custom-range-' + facetName + '__FinishDate').datepicker("option", "minDate", null);
        $('#pv-custom-range-' + facetName + '__StartDate').datepicker("option", "minDate", null);
        $('#pv-custom-range-' + facetName + '__FinishDate').datepicker("option", "maxDate", null);
        $('#pv-custom-range-' + facetName + '__StartDate').datepicker("option", "maxDate", null);
    };

    GetCustomDateRange = function (facetName) {
        var facet = _nameMapping[facetName];
        var category = PivotCollection.GetFacetCategoryByName(facet);
        var maxYear, minYear;
        var maxDate, minDate;
        $('#pv-custom-range-' + facetName + '__Start').css('visibility', 'visible'); 
        $('#pv-custom-range-' + facetName + '__Finish').css('visibility', 'visible'); 
        $('#pv-custom-range-' + facetName + '__StartDate').datepicker({
            showOn: 'button',
            changeMonth: true,
            changeYear: true,
            buttonText: 'Show Date',
            buttonImageOnly: true,
            buttonImage: 'http://jqueryui.com/resources/demos/datepicker/images/calendar.gif'
        });
        $('#pv-custom-range-' + facetName + '__FinishDate').datepicker({
            showOn: 'button',
            changeMonth: true,
            changeYear: true,
            buttonText: 'Show Date',
            buttonImageOnly: true,
            buttonImage: 'http://jqueryui.com/resources/demos/datepicker/images/calendar.gif'
        });
        if (category.dayBuckets.length > 0){
           maxDate = category.dayBuckets[category.dayBuckets.length - 1].StartDate;
           minDate = category.dayBuckets[0].StartDate;
           $('#pv-custom-range-' + facetName + '__StartDate').datepicker( "option", "defaultDate", minDate );
           $('#pv-custom-range-' + facetName + '__FinishDate').datepicker( "option", "defaultDate", maxDate );
           if (category.yearBuckets.length > 0){
               maxYear = category.yearBuckets[category.yearBuckets.length - 1].Name;
               minYear = category.yearBuckets[0].Name;
               $('#pv-custom-range-' + facetName + '__StartDate').datepicker( "option", "yearRange", minYear + ':' + maxYear );
               $('#pv-custom-range-' + facetName + '__FinishDate').datepicker( "option", "yearRange", minYear + ':' + maxYear );
            }
        }
    };

    CustomRangeChanged = function (textbox) {
        var start;        
        var end;
        if ($(textbox).attr('itemvalue') == "CustomRangeStart") {
            // Check we have value for matching end
            start = $(textbox)[0].value;
            end = $('#pv-custom-range-' + $(textbox).attr('itemfacet') + '__FinishDate')[0].value;
            if (end == "")
                $('#pv-custom-range-' + $(textbox).attr('itemfacet') + '__FinishDate').datepicker("option", "minDate", new Date(start));
        } else if ($(textbox).attr('itemvalue') == "CustomRangeFinish") {
            // Check we have value for matching start
            end = $(textbox)[0].value;
            start = $('#pv-custom-range-' + $(textbox).attr('itemfacet') + '__StartDate')[0].value;
            if (start == "")
                $('#pv-custom-range-' + $(textbox).attr('itemfacet') + '__StartDate').datepicker("option", "maxDate", new Date(end));
        }
        if (start && end) {
            // Clear any filters already set for this facet
            var checked = $(textbox.parentElement.parentElement.parentElement.parentElement.children).next().find('.pv-facet-facetitem:checked');
            for (var i = 0; i < checked.length; i++) {
                if ($(checked[i]).attr('itemvalue') != 'CustomRange')
                    $(checked[i]).prop('checked', false);
            }
            FilterCollection(false);
        }
    };

    //Constructor
    $.fn.PivotViewer = function (method) {
        // Method calling logic
        if (methods[method]) {
            return methods[method].apply(this, Array.prototype.slice.call(arguments, 1));
        } else if (typeof method === 'object' || !method) {
            return methods.init.apply(this, arguments);
        } else {
            $.error('Method ' + method + ' does not exist on jQuery.PivotViewer');
        }
    };
})(jQuery);
