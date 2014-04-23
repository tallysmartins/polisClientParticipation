var AnalyzeCommentView = require("../views/analyze-comment");
var display = require("../util/display");
var eb = require("../eventBus");
var template = require("../tmpl/analyze-global");
var CommentModel = require("../models/comment");
var Handlebones = require("handlebones");


var NUMBER_OF_REPRESENTATIVE_COMMENTS_TO_SHOW = 5;

function bbCompare(propertyName, a, b) {
  var x = b.get(propertyName) - a.get(propertyName);
  return x;
}
function bbCompareAscending(propertyName, a, b) {
  return -bbCompare(propertyName, a, b);
}
function compareTieBreaker(a, b) {
  var x = bbCompare("stars", a, b);
  x = x || bbCompareAscending("D", a, b);
  x = x || a.get("txt").length - b.get("txt").length; // shorter comments first
  x = x || (b.get("txt").toLowerCase() < a.get("txt").toLowerCase()) ? 1 : -1; // alphabetic
  return x;
}
function sortRepness(a, b) {
  var x = bbCompare("repness", a, b);
  return x || compareTieBreaker(a, b);
}
function comparatorAgree(a, b) {
  var x = bbCompare("A", a, b);
  return x || compareTieBreaker(a, b);
}
function comparatorDisagree(a, b) {
  var x = bbCompare("D", a, b);
  return x || compareTieBreaker(a, b);
}

function comparatorStars(a, b) {
  var x = bbCompare("stars", a, b);
  return x || compareTieBreaker(a, b);
}

var el_carouselSelector = "#carousel";

var AnalyzeCollectionView = Handlebones.CollectionView.extend({
  modelView: AnalyzeCommentView,
  modelFilter: function(model, index) {
    var searchString = this.parent.searchString;
    var visibleTids = this.parent.visibleTids;
    var tidsForGroup = this.parent.tidsForGroup;
    var searchEnabled = this.parent.searchEnabled;
    var tid = model.get("tid");
    var hadTid= visibleTids.indexOf(tid) >= 0;


    if (tidsForGroup && tidsForGroup.indexOf(tid) === -1) {
      visibleTids = _.without(visibleTids, tid);
      if (hadTid) {
        this.parent.shouldNotifyForFilterChange = true; // TODO needed?
      }
      return false;
    }
    if (!_.isString(searchString) || /^\s*$/.exec(searchString)) {
      if (!hadTid) {
        this.parent.trigger("searchChanged", visibleTids);
      }
      visibleTids = _.union(visibleTids, [tid]);
      return true;
    }
    searchString = searchString
      .replace(/\s+/g, " ")
      .replace(/\s+$/,"")
      .replace(/^\s+/,"");

    var isMatch = true;
    if (searchEnabled) {
      if (_.isString(searchString)) {
        var tokens = searchString.split(/\s+/);
        // match all space separated word fragments
        var txt = model.get("txt").toLowerCase();
        for (var i = 0; i < tokens.length; i++) {
          var token = tokens[i].toLowerCase();

          var shouldNegateToken = token[0] === "-";
          if (shouldNegateToken) {
            token = token.slice(1);
          }
          var tokenPresent = txt.indexOf(token) >= 0;
          if (!token.length) {
            // a "-" followed by nothing should not count as present.
            tokenPresent = false;
          }
          if (
            (!tokenPresent && !shouldNegateToken) ||
            (tokenPresent && shouldNegateToken)) {
            isMatch = false;
            break;
          }
        }
      }
    }
    var doTrigger = false;
    if (isMatch) {
      visibleTids = _.union(visibleTids, [model.get("tid")]);
      if (!hadTid) {
        doTrigger = true;
      }
    } else {
      visibleTids = _.without(visibleTids, model.get("tid"));
      if (hadTid) {
        doTrigger = true;
      }
    }
    if (doTrigger) {
      this.parent.trigger("searchChanged", visibleTids);
    }
    return isMatch;
  },
});


module.exports = Handlebones.View.extend({
    name: "analyze-global-view",
    template: template,
    tidsForGroup: null,
    visibleTids: [],
    events: {
      "click #sortStar": "sortStar",
      "click #sortAgree": "sortAgree",
      "click #sortDisagree": "sortDisagree",
      "keyup input": "updateSearch",
      "propertychange input": "updateSearch",
      submit: function(e) {
        e.preventDefault();
      },
      // "rendered:collection": function() {
      //   this.selectFirst();
      //   console.log('rendered:collection');
      // },
      rendered: function() {
        var that = this;
        var items = this.$(".query_result_item");
        items.on("mouseover", function() {
            $(this).addClass("hover");
        });
        items.on("mouseout", function() {
            $(this).removeClass("hover");
        });
      }
    },
    selectSortModes: function(chosenButtonSelector) {
      this.$("#sortAgree,#sortDisagree,#sortStar").removeClass("enabled");
      this.$(chosenButtonSelector).addClass("enabled");
    },
    selectFirst: function() {
      var first = this.collection.first();
      if (first) {
        eb.trigger(eb.commentSelected, first.get("tid"));
      }
    },
  searchEnabled: true,
  sortEnabled: true,
  sort: function(e) {
    this.collection.sort();
  },
  sortAgree: function(e) {
    this.collection.comparator = comparatorAgree;
    this.sort();
    this.selectFirst();
    this.selectSortModes("#sortAgree");
  },
  sortDisagree: function(e) {
    this.collection.comparator = comparatorDisagree;
    this.sort();
    this.selectFirst();
    this.selectSortModes("#sortDisagree");
  },
  sortStar: function(e) {
    alert("coming soon!");
  },

  sortRepness: function(e) {
    // There are no buttons associated with this.
    this.collection.comparator = sortRepness;
    this.sort();
  },
  useCarousel: function() {
      return !this.isIE8 && display.xs();
  },
  hideCarousel: function() {
    this.$("#carousel").hide();
  },
  showCarousel: function() {
    this.$("#carousel").show();
  },
  updateSearch: function(e) {
    this.searchString = e.target.value;
    this.deselectComments();
    this.analyzeCollectionView.updateModelFilter();
    // this.selectFirst();
  },
  deselectComments: function() {
    eb.trigger(eb.commentSelected, false);
  },
  renderWithCarousel: function() {

    $(el_carouselSelector).html("");
    // $(el_carouselSelector).css("overflow", "hidden");        

    // $(el_carouselSelector).append("<div id='smallWindow' style='width:90%'></div>");
    $(el_carouselSelector).append("<div id='smallWindow' style='left: 10%; width:80%'></div>");        

    var results = $("#smallWindow");
    results.addClass("owl-carousel");
    // results.css('background-color', 'yellow');

    if (results.data('owlCarousel')) {
      results.data('owlCarousel').destroy();
    }
    results.owlCarousel({
      items : NUMBER_OF_REPRESENTATIVE_COMMENTS_TO_SHOW, //3 items above 1000px browser width
      // itemsDesktop : [1000,5], //5 items between 1000px and 901px
      // itemsDesktopSmall : [900,3], // betweem 900px and 601px
      // itemsTablet: [600,2], //2 items between 600 and 0
      // itemsMobile : false // itemsMobile disabled - inherit from itemsTablet option
       singleItem : true,
       // autoHeight : true,
       afterMove: (function() {return function() {
          var tid = indexToTid[this.currentItem];
          setTimeout(function() {
              eb.trigger(eb.commentSelected, tid);
          }, 100);

      }}())
    });
    var indexToTid = this.collection.pluck("tid");

    _.each(this.collection.first(NUMBER_OF_REPRESENTATIVE_COMMENTS_TO_SHOW), function(c) {
      results.data('owlCarousel').addItem(
        "<div style='margin:10px; text-align:justify' class='well query_result_item'>" + 
          "<p>" +
            "Agrees: " + c.get("A") +
            " Disagrees: " + c.get("D") +
          "</p>" +
          c.get("txt") +
        "</div>");
    });
    // Auto-select the first comment.
    $(el_carouselSelector).find(".query_result_item").first().trigger("click");
  },
  initialize: function(options) {
    var that = this;
    this.collection = options.collection;

    this.analyzeCollectionView = this.addChild(new AnalyzeCollectionView({
      collection: this.collection
    }));

    var getTidsForGroup = options.getTidsForGroup;

    this.fetcher = options.fetcher;
    if (!this.useCarousel()) {
      $(el_carouselSelector).html("");
    }

    this.collection.comparator = comparatorAgree;
    
    eb.on(eb.commentSelected, function(tid) {
      that.collection.each(function(model) {
        if (model.get("tid") === tid) {
          model.set("selected", true);
        } else {
          model.set("selected", false);
        }
      });
    });


    eb.on(eb.clusterClicked, function(gid) {
      that.collection.firstFetchPromise.then(function() {
        if (gid === -1) {
          that.$("#commentSearch").show();
          that.$("#commentSort").show();
          that.$("#groupStats").hide();
          that.sortEnabled = true;
          that.searchEnabled = true;
          that.tidsForGroup = null;
          that.sortAgree();     
          that.analyzeCollectionView.updateModelFilter();
          if (that.useCarousel()) {
            that.renderWithCarousel();
          }
          that.selectFirst();
        } else {
          that.$("#commentSearch").hide();
          that.$("#commentSort").hide();
          that.$("#groupStats").show();
          that.sortEnabled = false;
          that.searchEnabled = false;
          getTidsForGroup(gid, NUMBER_OF_REPRESENTATIVE_COMMENTS_TO_SHOW).then(function(o) {
            that.tidsForGroup = o.tids;
            that.collection.updateRepness(o.tidToR);
            that.sortRepness();
            that.analyzeCollectionView.updateModelFilter();
            if (that.useCarousel()) {
              that.renderWithCarousel();
            }
            that.selectFirst();
          });
        }
      });
    });
  }
});