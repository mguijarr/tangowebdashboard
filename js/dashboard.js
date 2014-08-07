$(document).ready(function() {
      var n_panels = 0;
      var attribute_change_evsource = null;

      $.ajaxSetup({ cache: false, dataType: "json" });

      $("#clear_button").on("click", function(event) {
        event.preventDefault(); //this has to be done otherwise full page is reloaded! Why?
        clearPanels();
      });

      $("#connect_button").on("click", function(event) {
        event.preventDefault();

        var tango_db = $("#tangodb_text").val();
        
        $.get("fetchFromDatabase", { "tango_db": tango_db }, function(data) {
            //clearPanels();
            $("#tree").treeview(data);
        });
      });

      $('#tree').on('nodeSelected', function(event, node) {
        var tango_db = $("#tangodb_text").val();
        var device_fqdn = tango_db+"/"+node.text;

        $.get("retrieveAttributes", { "device_fqdn": device_fqdn }, function(data) {
          $("#attributes_list").empty();
          for(var i=0; i<data.length; i++) {
            var attr_name = data[i];
            var read_attribute_link = "<a class='attribute_link' href='readAttribute?device_fqdn="+device_fqdn+"&attribute="+attr_name+"'>"+attr_name+"</a>"
            $("#attributes_list").append("<li class='list-group-item'>"+read_attribute_link+"</li>");
            $("#attributes_list li:last-child a").data("device_fqdn", device_fqdn);
            $("#attributes_list li:last-child a").data("attribute", attr_name);
          };
          $(".attribute_link").on("click", function(event) {
            event.preventDefault();
 
            var device_fqdn = $(this).data("device_fqdn");
            var attribute = $(this).data("attribute");

            $.get("readAttribute",
                  { "device_fqdn": device_fqdn, "attribute": attribute }, 
                  function(data) { createPanel(device_fqdn+"/"+attribute, data); });

            if (attribute_change_evsource == null) {
              attribute_change_evsource = new EventSource("attributeChanges");
              attribute_change_evsource.onmessage = function(event) {
                var json_data = $.parseJSON(event.data);
                $("#attr_value_"+json_data.id).html(json_data.value);
              };
            };
          });
        });
      });

      var clearPanels = function() {
        $("#panels").empty();
      };
      };

      var createPanel = function(title, data) {
        var attr_id = data["id"];
        var attr_div_id = "attr_value_"+attr_id;
        $.jsPanel({ bootstrap: "info", title: title, selector: "#panels", content: data.value, id: attr_div_id });
        $("#"+attr_div_id).draggable({ containment: "parent" });
        $("#"+attr_div_id).resizable({ containment: "parent" });
        //set_attr_value(attr_id, data);
      };

      $(function() {
      });
});

