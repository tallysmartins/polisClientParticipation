var RootView = require("../views/root");
var Backbone = require("backbone");
var ConversationModel = require("../models/conversation");
var CookiesDisabledView = require("../views/cookiesDisabledView");
var CourseView = require("../views/course");
var RootsView = require("../views/roots");
var RootsRootView = require("../views/rootsRoot");
var ParticipantModel = require("../models/participant");
var bbFetch = require("../net/bbFetch");
var ConversationsCollection = require("../collections/conversations");
var eb = require("../eventBus");
var FaqCollection = require("../collections/faqs");
var FaqContent = require("../faqContent");
var InboxItemForApiView = require('../views/inboxItemForApi');
var InboxView = require("../views/inbox");
var InboxApiTestView = require("../views/inboxApiTest");
var HomepageView = require("../views/homepage");
var CreateConversationFormView = require("../views/create-conversation-form");
var HkNewView = require("../views/hkNew");
var ConversationDetailsView = require("../views/conversation-details");
var ConversationGatekeeperView = require("../views/conversationGatekeeperView");
var CreateUserForm = require("../views/create-user-form");
var ParticipationView = require("../views/participation");
var ExploreView = require("../views/explore");
var EmptyView = require("../views/empty-view");
var LoginFormView = require("../views/login-form");
var metric = require("../util/gaMetric");
var ModerationView = require("../views/moderation");
var PasswordResetView = require("../views/passwordResetView");
var PasswordResetInitView = require("../views/passwordResetInitView");
var SettingsEnterpriseView = require("../views/settingsEnterprise.js");
var SettingsView = require("../views/settings.js");
var ShareLinkView = require("../views/share-link-view");
var SummaryView = require("../views/summary.js");
var PlanUpgradeView = require("../views/plan-upgrade");
var FaqView = require("../views/faq");
var PolisStorage = require("../util/polisStorage");
var TutorialSlidesView = require("../views/tutorialSlides");
var UserModel = require("../models/user");
var Utils = require("../util/utils");
var _ = require("underscore");
var $ = require("jquery");
var gaEvent = require("../util/gaMetric").gaEvent;



var match = window.location.pathname.match(/ep1_[0-9A-Za-z]+$/);
var encodedParams = match ? match[0] : void 0;

var routeEvent = metric.routeEvent;

var authenticatedDfd = $.Deferred();
authenticatedDfd.done(function() {
  // link uid to GA userId
  // TODO update this whenever auth changes
  ga('set', 'userId', PolisStorage.uid() || PolisStorage.uidFromCookie());
});

function onFirstRender() {
  $("#mainSpinner").hide();
}
function authenticated() { return PolisStorage.uid() || PolisStorage.uidFromCookie() || window.authenticatedByHeader;}
function hasEmail() { return PolisStorage.hasEmail(); }

// TODO refactor this terrible recursive monster function.
function doJoinConversation(args) {
  var that = this;

  var onSuccess = args.onSuccess;
  var conversation_id = args.conversation_id;
  var suzinvite = args.suzinvite;
  var subviewName = args.subviewName;

  var uid = PolisStorage.uid() || PolisStorage.uidFromCookie();
  console.log("have uid", !!uid);
  if (!uid) {
      console.log("trying to load conversation, but no auth");
      // Not signed in.
      // Or not registered.

      if (suzinvite) {

        $.ajax({
          url: "/api/v3/joinWithInvite",
          type: "POST",
          dataType: "json",
          xhrFields: {
              withCredentials: true
          },
          // crossDomain: true,
          data: {
            conversation_id: conversation_id,
            suzinvite: suzinvite
          }
        }).then(function(data) {
          window.userObject = $.extend(window.userObject, data);
          that.participationView(conversation_id);
          gaEvent("Session", "create", "empty");
        }, function(err) {
          if (err.responseText === "polis_err_no_matching_suzinvite") {
            gaEvent("Session", "createFail", "polis_err_no_matching_suzinvite");
            setTimeout(function() {
              alert("Sorry, this single-use URL has been used.");
            },99);
          } else {
            that.conversationGatekeeper(conversation_id, suzinvite).done(function(ptptData) {
              doJoinConversation.call(that, args);
            });
          }
        });
      } else if (conversation_id) {
        // Don't require user to explicitly create a user before joining the conversation.
        $.ajax({
          url: "/api/v3/joinWithInvite",
          type: "POST",
          dataType: "json",
          xhrFields: {
              withCredentials: true
          },
          // crossDomain: true,
          data: {
            conversation_id: conversation_id
          }
        }).then(function(data) {
          window.userObject = $.extend(window.userObject, data);
          that.participationView(conversation_id);
          gaEvent("Session", "create", "empty");
        }, function(err) {
          if (/polis_err_need_full_user/.test(err.responseText)) {
            that.doCreateUserFromGatekeeper(conversation_id).done(function(ptptData) {
              doJoinConversation.call(that, args);
            });
          } else {
            // TODO when does this happen?
            that.conversationGatekeeper(conversation_id).done(function(ptptData) {
              doJoinConversation.call(that, args);
            });
          }
          // console.dir(err);
          // doCreateUserFromGatekeeper
        });
      } else {
        gaEvent("Session", "createFail", "polis_err_unexpected_conv_join_condition_1");
        setTimeout(function() {
          alert("missing conversation ID in URL. Shouldn't hit this.");
        },99);


        // !!!!!!!!!!TEMP CODE - JOIN WITHOUT A ZINVITE!!!!!
        // Don't require user to explicitly create a user before joining the conversation.
        $.ajax({
          url: "/api/v3/joinWithInvite",
          type: "POST",
          dataType: "json",
          xhrFields: {
              withCredentials: true
          },
          // crossDomain: true,
          data: {
            conversation_id: conversation_id,
            // zinvite: zinvite
          }
        }).then(function(data) {
          window.userObject = $.extend(window.userObject, data);
          that.participationView(conversation_id);
          gaEvent("Session", "create", "empty");
        }, function(err) {
          that.conversationGatekeeper(conversation_id).done(function(ptptData) {
            doJoinConversation.call(that, args);
          });
        });

      }
  } else { // uid defined
    var params = {
      conversation_id: conversation_id,
    };
    if (suzinvite) {
      params.suzinvite = suzinvite;
    }

    if (suzinvite) {
      // join conversation (may already have joined)
      var ptpt = new ParticipantModel(params);
      ptpt.save().then(function() {
        // Participant record was created, or already existed.
        // Go to the conversation.
        onSuccess(_.extend({
          ptptModel: ptpt
        }, args));
      }, function(err) {
        $.ajax({
          url: "/api/v3/joinWithInvite",
          type: "POST",
          dataType: "json",
          xhrFields: {
              withCredentials: true
          },
          // crossDomain: true,
          data: {
            conversation_id: conversation_id,
            suzinvite: suzinvite
          }
        }).then(function(data) {
          window.userObject = $.extend(window.userObject, data);
          doJoinConversation.call(that, args);
          // no ga session event, since they already have a uid
        }, function(err) {
          if (err.responseText === "polis_err_no_matching_suzinvite") {
            alert("Sorry, this single-use URL has been used.");
          } else {
            that.conversationGatekeeper(conversation_id, suzinvite).done(function(ptptData) {
              doJoinConversation.call(that, args);
            });
          }
        });
      });
    } else { // !singleUse
      // join conversation (may already have joined)
      var ptpt = new ParticipantModel(params);
      ptpt.save().then(function() {
        // Participant record was created, or already existed.
        // Go to the conversation.
        onSuccess(_.extend({
          ptptModel: ptpt
        }, args));
        // no ga session event, since they already have a uid
      }, function(err) {
        if (err && err.length && err[0] && err[0].length && err[0][0].responseText.match("lti_user")) {
          alert("Before joining, you must link this account to your Canvas account. Look for an assignment called \"setup pol.is\".");
        } else {
          // not sure if this path works, or ever occurs
          that.conversationGatekeeper(conversation_id).done(function(ptptData) {
            doJoinConversation.call(that, args);
          });
        }
      });
    }
  }
  //  else {
  //   // Found a pid for that conversation_id.
  //   // Go to the conversation.
  //   that.doLaunchConversation(conversation_id);
  // }

} // end doJoinConversation


var polisRouter = Backbone.Router.extend({
  initialize: function(options) {
    this.r("homepage", "homepageView");
    this.r(/^conversation\/create(\/ep1_[0-9A-Za-z]+)?/, "createConversation");
    this.r(/^hk\/new\/?$/, "hkNew");
    this.r("user/create", "createUser");
    this.r("user/login", "login");
    this.r(/^user\/logout(\/.+)/, "deregister");
    this.r("welcome/:einvite", "createUserViewFromEinvite");
    this.r(/^settings(\/ep1_[0-9A-Za-z]+)?/, "settings");
    this.r(/^settings\/enterprise(\/ep1_[0-9A-Za-z]+)?/, "settingsEnterprise");
    this.r("inbox", "inbox");
    this.r(/^inbox\/(ep1_[0-9A-Za-z]+)$/, "inboxLti");
    
    this.r("inboxApiTest(/:filter)", "inboxApiTest");
    this.r("faq", "faq");
    this.r("tut", "doShowTutorial");
    this.r("pwresetinit", "pwResetInit");
    this.r("prototype", "prototype");
    this.r("", "landingPageView");

    this.r(/^course\/(.*)/, "courseView");
    this.r(/^hk\/?$/, "hk");
    this.r(/^r\/?$/, "roots");
    this.r(/^s\/?$/, "rootsRoot");
    this.r(/^s\/(.+)$/, "roots");
    this.r(/^s\/new\/(.+)$/, "rootsNew");

    this.r(/^([0-9][0-9A-Za-z]+)\/?(\?.*)?$/, "participationViewWithQueryParams");  // conversation_id / query params
    this.r(/^([0-9][0-9A-Za-z]+)(\/ep1_[0-9A-Za-z]+)?$/, "participationView");  // conversation_id / encodedStringifiedJson
    this.r(/^ot\/([0-9][0-9A-Za-z]+)\/(.*)/, "participationViewWithSuzinvite"); // ot/conversation_id/suzinvite
    this.r(/^pwreset\/(.*)/, "pwReset");
    this.r(/^demo\/([0-9][0-9A-Za-z]+)/, "demoConversation");

    //this.r(/^explore\/([0-9][0-9A-Za-z]+)$/, "exploreView");  // explore/conversation_id
    this.r(/^share\/([0-9][0-9A-Za-z]+)$/, "shareView");  // share/conversation_id
    //this.r(/^summary\/([0-9][0-9A-Za-z]+)$/, "summaryView");  // summary/conversation_id
    this.r(/^m\/([0-9][0-9A-Za-z]+)\/?(.*)$/, "moderationView");  // m/conversation_id
    // this.r(/^iip\/([0-9][0-9A-Za-z]+)$/, "inboxItemParticipant");
    // this.r(/^iim\/([0-9][0-9A-Za-z]+)$/, "inboxItemModerator");

    var routesWithFooter = [
      /^faq/,
      /^settings/,
      /^settings\/enterprise/,
      /^summaryView/,
      /^inbox(\/.*)?$/,
      /^inboxLti/,      
      /^inboxApiTest$/,
      /^moderationView/,
      /^pwResetInit/,
      /^pwReset/,
      /^exploreView/,
      /^createConversation/
    ];
    function needsFooter(route) {
      return _.some(routesWithFooter, function(regex){
        return route.match(regex)
      });
    }
    this.on("route", function(route, params) {
      // if (needsFooter(route)) {
      //   $('[data-view-name="root"]').addClass("wrap");
      //   var footer = $("#footer").detach();
      //   $(document.body).append(footer);
      //   $("#footer").show();
      // } else {
        // $("#footer").hide();
        // $('[data-view-name="root"]').removeClass("wrap");
      // }
    });
    eb.once(eb.firstRender, function() {
      onFirstRender();
    });

    var that = this;
    eb.on("upvote_but_no_auth", function(o) {
        var promise = that.doLogin(true);
        promise.then(function() {
          $.post("/api/v3/upvotes", {
            conversation_id: o.conversation_id
          }).always(function() {
            that.redirect(o.pathname);
          });
        });
    });
    eb.on("createContext_but_no_auth", function(o) {
        var promise = that.doLogin(true);
        promise.then(function() {
          $.post("/api/v3/contexts", {
            name: o.name
          }).always(function() {
            that.redirect(o.pathname); // TODO this doesn't seem to get triggered
          });
        });
    });

    if (authenticated()) {
      authenticatedDfd.resolve();
    }

  }, // end initialize
  r: function(pattern, methodNameToCall) {
    var that = this;
    this.route(pattern, function() {
      routeEvent(methodNameToCall, arguments);
      that[methodNameToCall].apply(that, arguments);
    });
  },
  bail: function() {
    this.navigate("/", {trigger: true});
  },
  prototype: function() {
    var view = new EmptyView();
    RootView.getInstance().setView(view);
  },
  upgradePlan: function(plan_id) {
    var promise;
    if (!authenticated()) {
      window.planId = plan_id;
      promise = this.doLogin(false);
    } else if (!hasEmail() && !window.authenticatedByHeader) {
      window.planId = plan_id;
      promise = this.doLogin(true);
    } else {
      if (_.isUndefined(plan_id) && !_.isUndefined(window.plan_id)) {
        plan_id = window.planId;
      }
      promise = $.Deferred().resolve();
    }
    promise.then(function() {
      var userModel = new UserModel();
      bbFetch(userModel).then(function() {
        var view = new PlanUpgradeView({
          model: userModel,
          plan_id: plan_id,
        });
        RootView.getInstance().setView(view);
      });
    });

  },
  // inboxItemParticipant: function(conversation_id) {
  //   var model = new Backbone.Model({
  //     conversation_id: conversation_id,
  //     participant_count: 0,
  //     topic: "Placeholder Topic",
  //     description: "Placeholder Description",
  //     url_name: "https://preprod.pol.is/" + conversation_id,
  //     url_name_with_hostname: "https://preprod.pol.is/" + conversation_id,
  //     // url_moderate: "https://pol.is/m/" + conversation_id,
  //     target: "_blank",
  //     is_owner: false,
  //   })
  //   var view = new InboxItemForApiView({
  //     model: model
  //   });
  //   RootView.getInstance().setView(view);
  // },
  // inboxItemModerator: function(conversation_id) {
  //   var model = new Backbone.Model({
  //     conversation_id: conversation_id,
  //     participant_count: 0,
  //     topic: "Placeholder Topic",
  //     description: "Placeholder Description",
  //     url_name: "https://pol.is/" + conversation_id,
  //     url_name_with_hostname: "https://pol.is/" + conversation_id,
  //     url_moderate: "https://pol.is/m/" + conversation_id,
  //     target: "_blank",
  //     is_owner: true,
  //   })
  //   var view = new InboxItemForApiView({ // TODO moderator specific
  //     model: model
  //   });
  //   RootView.getInstance().setView(view);
  // },
  landingPageView: function() {
    if (!authenticated()) {
      this.navigate("user/create", {trigger: true});
      // RootView.getInstance().setView(new LandingPageView());
      // RootView.getInstance().setView(new CreateUserFormView({
      //   model : new Backbone.Model({
      //     // zinvite: zinvite,
      //     create: true
      //   })
      // }));
    } else {
      // this.inbox();
      this.navigate("inbox", {trigger: true});
    }
  },
  settings: function(encodedStringifiedJson) {
    var promise = $.Deferred().resolve();
    if (!authenticated()) {
      promise = this.doLogin(false);
    } else if (!hasEmail()  && !window.authenticatedByHeader) {
      promise = this.doLogin(true);
    }
    promise.then(function() {
      var userModel = new UserModel();
      bbFetch(userModel).then(function() {
          var v = new SettingsView({
          model: userModel,
        });
        RootView.getInstance().setView(v);
      });
    });
  },
  settingsEnterprise: function(encodedStringifiedJson) {
    var o = {};
    if (encodedStringifiedJson && encodedStringifiedJson.length) {
      o = Utils.decodeParams(encodedStringifiedJson);
    }
    // alert(o.monthly);
    // alert(o.maxUsers);
    var promise = $.Deferred().resolve();
    if (!authenticated()) {
      promise = this.doLogin(false);
    } else if (!hasEmail()  && !window.authenticatedByHeader) {
      promise = this.doLogin(true);
    }
    promise.then(function() {
      var userModel = new UserModel();
      bbFetch(userModel).then(function() {
          var v = new SettingsEnterpriseView({
          model: userModel,
          proposal: o
        });
        RootView.getInstance().setView(v);
      });
    });
  },
  deregister: function(dest) {
    window.deregister(dest);
  },
  shareView: function(conversation_id) {
    var that = this;
    this.getConversationModel(conversation_id).then(function(model) {
      var view = new ShareLinkView({
        model: model
      });
      RootView.getInstance().setView(view);
    },function(e) {
      console.error("error2 loading conversation model");
    });
  },
  inbox: function(encodedStringifiedJson){
    var promise = $.Deferred().resolve();

    if (!authenticated()) {
      promise = this.doLogin(false);
    } else if (!hasEmail()  && !window.authenticatedByHeader) {
      promise = this.doLogin(true);
    }
    promise.then(function() {
      // TODO add to inboxview init
      // conversationsCollection.fetch({
      //     data: $.param({
      //         is_active: false,
      //         is_draft: false,
      //     }),
      //     processData: true,
      // });
      var filterAttrs = {};
      if (encodedStringifiedJson) {
        console.log(encodedStringifiedJson);
        // // check for context
        // if (filter.match(/context=([^=?]+)/).length > 1) {
        //   filterAttrs.context = filter.match(/context=([^=?]+)/)[1];
        // }
        var o = Utils.decodeParams(encodedStringifiedJson);
        console.dir(o);
        filterAttrs = $.extend(filterAttrs, o);
      } else {

        // Default inbox behavior
        
        // Not just the ones I started.
        filterAttrs.include_all_conversations_i_am_in = true;
      }

      var conversationsCollection = new ConversationsCollection();
      // Let the InboxView filter the conversationsCollection.

      var userModel = new UserModel();
      bbFetch(userModel).then(function() {
        var inboxView = new InboxView({
          model: userModel,
          collection: conversationsCollection,
          filters: filterAttrs
        });
        RootView.getInstance().setView(inboxView);
      });
      
    });
  },

  inboxLti: function(encodedStringifiedJson){
    var promise = $.Deferred().resolve();

    if (!authenticated()) {
      promise = this.doLogin(false);
    }
    promise.then(function() {
      // TODO add to inboxview init
      // conversationsCollection.fetch({
      //     data: $.param({
      //         is_active: false,
      //         is_draft: false,
      //     }),
      //     processData: true,
      // });
      var filterAttrs = {};
      if (encodedStringifiedJson) {
        console.log(encodedStringifiedJson);
        // // check for context
        // if (filter.match(/context=([^=?]+)/).length > 1) {
        //   filterAttrs.context = filter.match(/context=([^=?]+)/)[1];
        // }
        var o = Utils.decodeParams(encodedStringifiedJson);
        console.dir(o);
        filterAttrs = $.extend(filterAttrs, o);
      } else {

        // Default inbox behavior
        
        // Not just the ones I started.
        filterAttrs.include_all_conversations_i_am_in = true;
      }

      var conversationsCollection = new ConversationsCollection();
      // Let the InboxView filter the conversationsCollection.
      var inboxView = new InboxView({
        collection: conversationsCollection,
        filters: filterAttrs
      });
      RootView.getInstance().setView(inboxView);
    });
  },
  hk: function() {
    if (Utils.isIos() && (window.top != window)) {
      // this.tryCookieThing();
      window.top.location = "https://pol.is/hk";
    }
    var filterAttrs = {
      is_draft: false,
      want_upvoted: true,
      context: "hongkong2014"
    };
    var conversationsCollection = new ConversationsCollection();
    // Let the InboxView filter the conversationsCollection.
    var view = new CourseView({
      collection: conversationsCollection,
      filters: filterAttrs
    });
    RootView.getInstance().setView(view);
  },
  rootsRoot: function() {
    var view = new RootsRootView();
    RootView.getInstance().setView(view);
  },
  roots: function(context) {
    var filterAttrs = {
      is_draft: false,
      is_active: true,
      // want_upvoted: true,
      limit: 99,
      context: context || "/", // NOTE "/" context is magic -- see server
    };
    var conversationsCollection = new ConversationsCollection();
    // Let the InboxView filter the conversationsCollection.
    var view = new RootsView({
      collection: conversationsCollection,
      filters: filterAttrs
    });
    RootView.getInstance().setView(view);
  },
  courseView: function(course_invite){
    var promise = $.Deferred().resolve();
    if (!authenticated()) {
      promise = this.doLogin(false);
    } else if (!hasEmail()  && !window.authenticatedByHeader) {
      promise = this.doLogin(true);
    }
    promise.then(function() {
      var filterAttrs = {
        course_invite: course_invite
      };
      // Not just the ones I started.
      filterAttrs.include_all_conversations_i_am_in = true;

      var conversationsCollection = new ConversationsCollection();
      // Let the InboxView filter the conversationsCollection.
      var view = new CourseView({
        collection: conversationsCollection,
        filters: filterAttrs
      });
      RootView.getInstance().setView(view);
    });
  },
  inboxApiTest: function(filter){
    var promise = $.Deferred().resolve();
    if (!authenticated()) {
      promise = this.doLogin(false);
    } else if (!hasEmail()  && !window.authenticatedByHeader) {
      promise = this.doLogin(true);
    }
    promise.then(function() {
      // TODO add to inboxview init
      // conversationsCollection.fetch({
      //     data: $.param({
      //         is_active: false,
      //         is_draft: false,
      //     }),
      //     processData: true,
      // });
      var filterAttrs = {};
      // filterAttrs.want_inbox_item_admin_html = true;
      // filterAttrs.want_inbox_item_admin_html = true;
      filterAttrs.limit = 5;
      // filterAttrs.include_all_conversations_i_am_in = true; // don't want this for api test
      filterAttrs.want_mod_url = true;
      filterAttrs.user_id = "user_12345";
      // filterAttrs.want_inbox_item_participant_url = true;
      // if (filter) {
      //   switch(filter) {
      //     case "closed":
      //       filterAttrs.is_active = false;
      //       filterAttrs.is_draft = false;
      //     break;
      //     case "active":
      //       filterAttrs.is_active = true;
      //     break;
      //     default:
      //       filterAttrs.is_active = true;
      //     break;
      //   }
      // }
      var conversationsCollection = new ConversationsCollection();
      // Let the InboxView filter the conversationsCollection.
      var inboxView = new InboxApiTestView({
        filters: filterAttrs,
        collection: conversationsCollection
      });
      RootView.getInstance().setView(inboxView);
    });
  },
  homepageView: function(){
    var homepage = new HomepageView();
    RootView.getInstance().setView(homepage);
  },
  createConversation: function(encodedStringifiedJson){
    var promise = $.Deferred().resolve();
    if (!authenticated()) {
      promise = this.doLogin(false);
    } else if (!hasEmail()  && !window.authenticatedByHeader) {
      promise = this.doLogin(true);
    }
    var paramsFromPath = {};
    if (encodedStringifiedJson) {
      paramsFromPath = Utils.decodeParams(encodedStringifiedJson);
    }
    var that = this;
    promise.then(function() {
      function onFail(err) {
        alert("failed to create new conversation");
        console.dir(err);
      }
      conversationsCollection = new ConversationsCollection();

      var o = {
        is_draft: true,
        is_active: true // TODO think
      };


      var model = new ConversationModel(o);

      model.save().then(function(data) {
        var conversation_id = data[0][0].conversation_id;
        model.set("conversation_id", conversation_id);

        var ptpt = new ParticipantModel({
          conversation_id: conversation_id
        });
        return ptpt.save();
      }).then(function(ptptAttrs) {
        var createConversationFormView = new CreateConversationFormView({
          model: model,
          paramsFromPath: paramsFromPath,
          collection: conversationsCollection,
          pid: ptptAttrs.pid,
          add: true
        });
        that.listenTo(createConversationFormView, "all", function(eventName, data) {
          if (eventName === "done") {
            // NOTE suurls broken for now
            // var suurls = data;
            //   if (suurls) {
            //   var suurlsCsv = [];
            //   var len = suurls.xids.length;
            //   var xids = suurls.xids;
            //   var urls = suurls.urls;
            //   for (var i = 0; i < len; i++) {
            //     suurlsCsv.push({xid: xids[i], url: urls[i]});
            //   }
            //   model.set("suurls", suurlsCsv);
            // }

            if (paramsFromPath.custom_canvas_assignment_id) {
              // This is attached to a Canvas assignment, take the instructor right to the conversation. They shouldn't be sharing the link, because participation outside Canvas will not be graded.
              that.navigate("/" + model.get("conversation_id"), {trigger: true});
            } else {
              // The usual case, show the share page.
              that.navigate("share/" + model.get("conversation_id"), {trigger: true});
            }
          }
        });
        RootView.getInstance().setView(createConversationFormView);
        $("[data-toggle='checkbox']").each(function() {
          var $checkbox = $(this);
          $checkbox.checkbox();
        });
      }, onFail);
    });
  },

  hkNew: function(){
    var promise = $.Deferred().resolve();
    if (!authenticated()) {
      promise = this.doLogin(true);
    } else if (!hasEmail()  && !window.authenticatedByHeader) {
      promise = this.doLogin(true);
    }
    var paramsFromPath = {};
    var that = this;
    promise.then(function() {
      function onFail(err) {
        alert("failed to create new conversation");
        console.dir(err);
      }
      conversationsCollection = new ConversationsCollection();

      var o = {
        context: "hongkong2014",
        is_draft: true,
        is_active: true // TODO think
      };


      var model = new ConversationModel(o);

      model.save().then(function(data) {
        var conversation_id = data[0][0].conversation_id;
        model.set("conversation_id", conversation_id);

        var ptpt = new ParticipantModel({
          conversation_id: conversation_id
        });
        return ptpt.save();
      }).then(function(ptptAttrs) {
        var createConversationFormView = new HkNewView({
          model: model,
          paramsFromPath: paramsFromPath,
          collection: conversationsCollection,
          pid: ptptAttrs.pid,
          add: true
        });
        that.listenTo(createConversationFormView, "all", function(eventName, data) {
          if (eventName === "done") {
            // NOTE suurls broken for now
            // var suurls = data;
            //   if (suurls) {
            //   var suurlsCsv = [];
            //   var len = suurls.xids.length;
            //   var xids = suurls.xids;
            //   var urls = suurls.urls;
            //   for (var i = 0; i < len; i++) {
            //     suurlsCsv.push({xid: xids[i], url: urls[i]});
            //   }
            //   model.set("suurls", suurlsCsv);
            // }

            if (paramsFromPath.custom_canvas_assignment_id) {
              // This is attached to a Canvas assignment, take the instructor right to the conversation. They shouldn't be sharing the link, because participation outside Canvas will not be graded.
              that.navigate("/" + model.get("conversation_id"), {trigger: true});
            } else {
              // The usual case, show the hk index
              that.navigate("/hk", {trigger: true});
            }
          }
        });
        RootView.getInstance().setView(createConversationFormView);
        $("[data-toggle='checkbox']").each(function() {
          var $checkbox = $(this);
          $checkbox.checkbox();
        });
      }, onFail);
    });
  },

  rootsNew: function(context){
    var promise = $.Deferred().resolve();
    if (!authenticated()) {
      promise = this.doLogin(true);
    } else if (!hasEmail()  && !window.authenticatedByHeader) {
      promise = this.doLogin(true);
    }
    var paramsFromPath = {};
    var that = this;
    promise.then(function() {
      function onFail(err) {
        alert("failed to create new conversation");
        console.dir(err);
      }
      conversationsCollection = new ConversationsCollection();

      var o = {
        context: context,
        is_draft: true,
        is_active: true // TODO think
      };


      var model = new ConversationModel(o);

      model.save().then(function(data) {
        var conversation_id = data[0][0].conversation_id;
        model.set("conversation_id", conversation_id);

        var ptpt = new ParticipantModel({
          conversation_id: conversation_id
        });
        return ptpt.save();
      }).then(function(ptptAttrs) {


        var createConversationFormView = new CreateConversationFormView({
          model: model,
          paramsFromPath: paramsFromPath,
          collection: conversationsCollection,
          pid: ptptAttrs.pid,
          add: true
        });
        that.listenTo(createConversationFormView, "all", function(eventName, data) {
          if (eventName === "done") {
            that.navigate("/" + data.conversation_id, {trigger: true});
          }
        });
        RootView.getInstance().setView(createConversationFormView);
        $("[data-toggle='checkbox']").each(function() {
          var $checkbox = $(this);
          $checkbox.checkbox();
        });
      }, onFail);
    });
  },

  doLaunchConversation: function(args) {
    var ptptModel = args.ptptModel;
    var conversation_id = ptptModel.get("conversation_id");
    var pid = ptptModel.get("pid");
    
    // Since nextComment is pretty slow, fire off the request way early and pass the promise into the participation view so it's (probably) ready when the page loads.
    var firstCommentPromise = $.get("/api/v3/nextComment?not_voted_by_pid=" + pid+ "&limit=1&conversation_id=" + conversation_id);

    this.getConversationModel(conversation_id).then(function(model) {

      if (!_.isUndefined(args.vis_type)) {
        // allow turning on the vis from the URL.
      if (model.get("is_mod")) {
          model.set("vis_type", Number(args.vis_type));
        }
      }
      var participationView = new ParticipationView({
        pid: pid,
        model: model,
        ptptModel: ptptModel,
        finishedTutorial: userObject.finishedTutorial,
        firstCommentPromise: firstCommentPromise
      });
      RootView.getInstance().setView(participationView);
    },function(e) {
      console.error("error3 loading conversation model");
    });
  },

  doLaunchExploreView: function(args) {
    var ptptModel = args.ptptModel;
    var conversation_id = ptptModel.get("conversation_id");
    var pid = ptptModel.get("pid");
    
    this.getConversationModel(conversation_id).then(function(model) {
      var exploreView = new ExploreView({
        pid: pid,
        model: model
      });
      RootView.getInstance().setView(exploreView);
    },function(e) {
      console.error("error4 loading conversation model");
      console.dir(arguments);
    });
  },
  doLaunchSummaryView: function(args) {
    var ptptModel = args.ptptModel;
    var conversation_id = ptptModel.get("conversation_id");
    var pid = ptptModel.get("pid");
    
    this.getConversationModel(conversation_id).then(function(model) {
      var view = new SummaryView({
        pid: pid,
        model: model
      });
      RootView.getInstance().setView(view);
    },function(e) {
      console.error("error5 loading conversation model");
      console.dir(arguments);
    });
  },
  doLaunchModerationView: function(args) {
    var ptptModel = args.ptptModel;
    var subviewName = args.subviewName;
    var conversation_id = ptptModel.get("conversation_id");
    var pid = ptptModel.get("pid");
    
    this.getConversationModel(conversation_id).then(function(model) {
      if (!model.get("is_mod")) {
        alert("Sorry, only moderators can moderate this conversation.");
        return;
      }
      var view = new ModerationView({
        subviewName: subviewName,
        pid: pid,
        model: model
      });
      RootView.getInstance().setView(view);
    },function(e) {
      console.error("error6 loading conversation model");
    });
  },


  demoConversation: function(conversation_id) {
    var ptpt = new ParticipantModel({
      conversation_id: conversation_id,
      pid: -123 // DEMO_MODE
    });

    // NOTE: not posting the model

    this.doLaunchConversation({
      ptptModel: ptpt
    });
  },
  participationViewWithSuzinvite: function(conversation_id, suzinvite) {
    window.suzinvite = suzinvite;
    return this.participationView(conversation_id, null, suzinvite);
  },
  exploreView: function(conversation_id, zinvite) {
    doJoinConversation.call(this, {
      onSuccess: this.doLaunchExploreView.bind(this), // TODO
      conversation_id: conversation_id
    });
  },
  summaryView: function(conversation_id, zinvite) {
    doJoinConversation.call(this, {
      onSuccess: this.doLaunchSummaryView.bind(this), // TODO
      conversation_id: conversation_id
    });
  },

  moderationView: function(conversation_id, subviewName) {
    doJoinConversation.call(this, {
      subviewName: subviewName,
      onSuccess: this.doLaunchModerationView.bind(this), // TODO
      conversation_id: conversation_id
    });
  },
  tryCookieThing: function() {
    function browserCompatibleWithRedirectTrick() {
      var ua = navigator.userAgent;
      if (ua.match(/Firefox/)) {
        // if (ua.match(/Android/)) {
        //   return false;
        // }
        // return true;
        return false;
      } else if (ua.match(/Trident/)) { // IE8+
        return true;
      } else if (ua.match(/Chrome/)) {
        return false;
      } else if (ua.match(/Safari/)) { // would include Chrome, but we handled Chrome above
        return true;
      } else {
        return false
      }
    }

    // if our script is running on a page in which we're embedded, postmessage
    if (top.postMessage && browserCompatibleWithRedirectTrick()) {
      top.postMessage("cookieRedirect", "*");
    }
    
    // don't need this view, since we have the auth header, which lets us set up a temporary session.

    // // give the polisHost script enough time to navigate away (if it's listening) before showing the cookiesDisabledView
    // setTimeout(function() {
    //   // TODO emit GA event here
    //   var view = new CookiesDisabledView();
    //   RootView.getInstance().setView(view);
    // }, 500);
  },
  participationView: function(conversation_id, encodedStringifiedJson,suzinvite) {
    if (!Utils.cookiesEnabled()) {
      this.tryCookieThing();
    }
    var params = {};
    if (encodedStringifiedJson) {
      encodedStringifiedJson = encodedStringifiedJson.slice(1);
      params = Utils.decodeParams(encodedStringifiedJson);
    }

    var that = this;
    // this.doShowTutorial().then(function() {
      doJoinConversation.call(that, _.extend(params, {
        suzinvite: suzinvite,
        onSuccess: that.doLaunchConversation.bind(that), // TODO
        conversation_id: conversation_id
      }));
    // });
  },
  participationViewWithQueryParams: function(conversation_id, queryParamString) {
    if (!Utils.cookiesEnabled()) {
      this.tryCookieThing();
    }

    var params = Utils.parseQueryParams(queryParamString);
    var that = this;
    // this.doShowTutorial().then(function() {
      doJoinConversation.call(that, _.extend(params, {
        onSuccess: that.doLaunchConversation.bind(that), // TODO
        conversation_id: conversation_id
      }));
    // });
  },
  doShowTutorial: function() {
    var dfd = $.Deferred();
    var view = new TutorialSlidesView({
        model: new Backbone.Model({})
      });
    view.on("done", dfd.resolve);
    RootView.getInstance().setView(view);
    return dfd.promise();
  },
  getConversationModel: function(conversation_id, suzinvite) {
    return $.get("/api/v3/conversations?conversation_id=" + conversation_id).then(function(conv) {
      var model = new ConversationModel(conv);
      if (suzinvite) {
        model.set("suzinvite", suzinvite);
      }
      return model;
    });
  },
  
  // assumes the user already exists.
  conversationGatekeeper: function(conversation_id, suzinvite) {
    var dfd = $.Deferred();
    this.getConversationModel(conversation_id, suzinvite).then(function(model) {
      data.model = model;
      var gatekeeperView = new ConversationGatekeeperView(data);
      gatekeeperView.on("done", dfd.resolve);
      RootView.getInstance().setView(gatekeeperView);
    }, dfd.reject);

    return dfd.promise();
  },
  doCreateUserFromGatekeeper: function(conversation_id) {
    var dfd = $.Deferred();

    this.getConversationModel(conversation_id).then(function(model) {
      model.set("create", true); // do we need this?
      var view = new CreateUserForm({
        model : model
      });
      view.on("authenticated", dfd.resolve);
      RootView.getInstance().setView(view);
    },function(e) {
      console.error("error1 loading conversation model");
      setTimeout(function() { that.participationView(conversation_id); }, 5000); // retry
    });
    return dfd.promise();
  },
  redirect: function(path) {
    document.location = document.location.protocol + "//" + document.location.host + path + (encodedParams ? ("/"+encodedParams): "");
  },
  createUser: function(){
    var that = this;
    this.doLogin(true).done(function() {
    // this.doCreateUser().done(function() {

        // trash the JS context, don't leave password sitting around
        that.redirect("/inbox");

      // that.inbox();
    });
  },
  createUserViewFromEinvite: function(einvite) {
    var that = this;
    var model = {
      einvite: einvite,
      hideHaveAccount: true,
      readonlyEmail: true,
      showEmailWelcome: true,
      create: true
    };
    $.getJSON("/api/v3/einvites?einvite=" + einvite).then(function(o) {
      model.email = o.email;      
      return model;
    }, function() {
      // einvite lookup failed somehow, go ahead and show the form - the user will have to enter their email again.
      console.error("einvite lookup failed");
      return $.Deferred().resolve(model);
    }).then(function(model) {
      var view = new CreateUserForm({
        model: new Backbone.Model(model)
      });
      view.on("authenticated", function() {
        // trash the JS context, don't leave password sitting around
        that.redirect("/inbox");
      });
      RootView.getInstance().setView(view);
    });
  },
  pwReset: function(pwresettoken) {
    var view = new PasswordResetView({
      pwresettoken: pwresettoken
    });
    RootView.getInstance().setView(view);
  },
  pwResetInit: function() {
    var view = new PasswordResetInitView();
    RootView.getInstance().setView(view );
  },
  doLogin: function(create) {
    var dfd = $.Deferred();
    var gatekeeperView = new CreateUserForm({
      model: new Backbone.Model({
        create: create
      })
    });
    gatekeeperView.on("authenticated", dfd.resolve);
    RootView.getInstance().setView(gatekeeperView);
    dfd.done(authenticatedDfd.resolve);
    return dfd.promise();
  },
  login: function(){
    var that = this;
    this.doLogin(false).done(function() {
        // trash the JS context, don't leave password sitting around
        that.redirect("/inbox");
    });
  },
  faq: function(){
    var faqCollection = new FaqCollection(FaqContent)
    var faqView = new FaqView({collection: faqCollection});
    RootView.getInstance().setView(faqView);
  }
});

 module.exports = polisRouter;
