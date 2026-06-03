import { app } from "mu";
import bodyParser from "body-parser";

app.use(
  bodyParser.json({
    type: function (req) {
      return req.get("content-type").startsWith("application/json");
    },
  }),
);

app.get("/", function (req, res) {
  res.send("Hello from lpdc-email-notification-service");
});
