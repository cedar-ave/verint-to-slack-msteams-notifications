//This function receives Verint webhook events and transforms them to posts in Slack and/or Microsoft Teams.

//Prerequisite: in Kudu > CMD prompt > navigate to site root (where package.json is) > `npm install`
//Prerequisite: Slack emojis and their codes (e.g., :smile:)

//Note: `Comment` events are treated uniquely in this function because their JSON structure differs from all other content types

//Troubleshoot: If after a certain number of events or time the Azure Function continues to receive events successfully but will not execute the Function, an Azure Logic App in the same resource group can intercepts webhook events and pass them onto this Function.

module.exports = function (context, data) {
  var json = data.body;

  var request = require("request");

  // Parse the webhook event JSON body
  var unparsedEvents = json.events;
  for (let event of unparsedEvents) {
    var ContentId = event.EventData.ContentId;
    var ContentTypeId = event.EventData.ContentTypeId;
    var CommentId = event.EventData.CommentId;
    var options = new Object();

    console.log("ContentId:", ContentId);
    console.log("ContentTypeId:", ContentTypeId);
    console.log("CommentId:", CommentId);

    if (CommentId) {
      options.url =
        "https://community.ORGANIZATION.com/api.ashx/v2/comments/" +
        CommentId +
        ".json";
      options.headers = {
        "Rest-User-Token": "TOKEN",
        "Content-Type": "application/json",
      };
    } else {
      options.url =
        "https://community.ORGANIZATION.com/api.ashx/v2/genericcontent/" +
        ContentId +
        "/" +
        ContentTypeId +
        ".json";
      options.headers = {
        "Rest-User-Token": "TOKEN",
        "Content-Type": "application/json",
      };
    }

    console.log("options:", options);
    console.log();

    function callback(error, response, body) {
      if (!error && response.statusCode == 200) {
        var info = JSON.parse(body);

        var username, profileUrl, subject, url, text, containerId;

        //For all content types but comments
        if (info.hasOwnProperty("Content")) {
          username = info.Content.CreatedByUser.DisplayName;
          profileUrl = info.Content.CreatedByUser.ProfileUrl;
          subject = info.Content.HtmlName;
          url = info.Content.Url;
          text = info.Content.HtmlDescription;
          containerId = info.Content.Application.Container.ContainerId;
        }

        //For comments
        if (info.hasOwnProperty("Comment")) {
          username = info.Comment.User.DisplayName;
          profileUrl = info.Comment.User.ProfileUrl;
          subject = info.Comment.Content.HtmlName;
          url = info.Comment.Content.Url;
          text = info.Comment.Body;
          containerId = info.Comment.Content.Application.Container.ContainerId;
        }
      }

      //Address paragraph breaks that otherwise smoosh sentences together
      var para = text.replace(/<\/p><p>/, " ");

      //HTML to plain text (subject)
      var Entities = require("html-entities").AllHtmlEntities;
      entities = new Entities();
      var title = entities.decode(subject);

      //HTML to plain text (body text)
      var slackify = require("../Shared/slackify-html.js");
      var doc = slackify(para);

      //No line breaks
      var noLineBreak = doc.replace(/\n/g, " ");

      //Limit character length
      var trimmedString = noLineBreak.substring(0, 325);
      //Do not cut off in the middle of a word
      readyString = trimmedString.substr(
        0,
        Math.min(trimmedString.length, trimmedString.lastIndexOf(" "))
      );

      //Send to Slack
      function sendToSlack(theUsername, theIconEmoji) {
        var theUsername = "Verint Bot";
        var theIconEmoji = ":bot:";

        var payload = {
          attachments: [
            {
              author_name: username,
              author_link: profileUrl,
              title: title,
              title_link: url,
              text: readyString,
              color: "#00aeff",
            },
          ],
        };
        if (theUsername !== undefined) {
          payload.username = theUsername;
        }
        if (theIconEmoji !== undefined) {
          payload.icon_emoji = theIconEmoji;
        }
        var theRequest = {
          url: urlWebHook,
          method: "POST",
          json: payload,
        };
        request(theRequest, function (error, response, body) {});
      }

      //Send to Microsoft Teams
      function msteams() {
        context.res = {
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: {
            team: msTeamsTeamId,
            channel: msTeamsChannelId,
            name: username,
            profileUrl: profileUrl,
            title: title,
            link: url,
            text: readyString,
          },
        };
        context.done();
      }

      // Customize recipients
      // Verint Group aka Container = "Customers"

      // Send to Slack channel
      if (containerId == VERINTGROUPID) {
        var urlWebHook = "SLACK INCOMING WEBHOOK URL";
        sendToSlack();

      // Send to Microsoft Teams channel
      var msTeamsTeamId = "MICROSOFT TEAM ID";
      var msTeamsChannelId = "MICROSOFT TEAM CHANNEL ID";
        msteams();
      }

      //Verint group aka Container = "Employees"
      if (containerId == VERINTGROUPID) {
        var urlWebHook = "SLACK INCOMING WEBHOOK";
        sendToSlack();

      // Send to Microsoft Teams channel
      var msTeamsTeamId = "MICROSOFT TEAM ID";
      var msTeamsChannelId = "MICROSOFT TEAM CHANNEL ID";
        msteams();
      }
    }
    request(options, callback);
  }
};
