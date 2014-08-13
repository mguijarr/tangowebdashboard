$(document).ready(function() {
      var servers_devices_data = {};
      var attribute_change_evsource = null;

      $.ajaxSetup({ cache: false, dataType: "json" });

      $("#attributes").toggle();
      $("#back_to_devices_tree_link").on("click", function(event) {
        event.preventDefault(); 
        $("#attributes").toggle();
        $("#treeview").toggle();
      });

      $("#clear_button").on("click", function(event) {
        event.preventDefault(); //this has to be done otherwise full page is reloaded! Why?
        clearPanels();
      });

      $("#connect_button").on("click", function(event) {
        event.preventDefault();

        var tango_db = $("#tangodb_text").val();
        
        $.get("fetchFromDatabase", { "tango_db": tango_db }, function(data) {
            $("#attributes_list").empty();
            data.showBorder = false;
            $("#tree").treeview({ data: data, levels:1, nodeIcon:"glyphicon glyphicon-cog" });
        });
      });

      $('#tree').on('nodeSelected', function(event, node) {
        var tango_db = $("#tangodb_text").val();
        var device_fqdn = tango_db+"/"+node.text;

        $.get("retrieveAttributes", { "device_fqdn": device_fqdn }, function(data) {
          for(var i=0; i<data.length; i++) {
            var attr_name = data[i];
            
            var read_attribute_link = "<a class='attribute_link' href='readAttribute?device_fqdn="+device_fqdn+"&attribute="+attr_name+"'>"+attr_name+"</a><br>"
            $("#attributes_list").append("<li class='list-group-item'>"+read_attribute_link+"</li>");
            $("#attributes_list li:last-child a").data("device_fqdn", device_fqdn);
            $("#attributes_list li:last-child a").data("attribute", attr_name);
          };

          $("#treeview").toggle();
          $("#device_name").html(device_fqdn);
          $("#attributes").toggle();

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
                set_attr_value(json_data.id, jsdon_data);
              };
            };
          });
        });
      });

      var clearPanels = function() {
        $("#panels").empty();
      };

      var set_attr_value = function(attr_id, json_data) {
            $("#attr_value_"+attr_id).html(json_data.value);
      };

      var createPanel = function(title, data) {
        var attr_id = data["id"];
        var attr_div_id = "attr_value_"+attr_id;

        $("#panels").append("<div class='col-md-3'><div class='panel panel-info dashboard-panel'> \
          <div class='panel-heading'>"+title+"</div> \
          <div class='panel-body'><h1 id='"+attr_div_id+"'#VALUE?</h1></div> \
          </div></div>");
        $("#panels").sortable({
          handle: $(".dashboard-panel .panel-heading");
        });
        $(".col-md-3").resizable({
          stop: function() { $(this).height("auto"); 
        });
     
        set_attr_value(attr_id, data);
      };
});

