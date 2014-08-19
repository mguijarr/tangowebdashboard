import os
import gevent
import gevent.event
import gevent.queue
import gevent.server
from gevent.wsgi import WSGIServer
import bottle
import socket
import json
import time
import PyTango
from PyTango.gevent import DeviceProxy
import types
from gevent._threading import Queue

DEVICES = {}

dashboard = bottle.Bottle()

@dashboard.get('/')
def tango_dashboard_builder():
  try:
    tango_db = bottle.request.GET["tango_db"]
  except:
    tango_db = None
  index_html = file(os.path.join(os.path.dirname(__file__), "dashboard_builder.html"), 'r')
  return index_html.read()

@dashboard.route('/js/<url:re:.+>')
def send_static_res(url):
  return bottle.static_file(url, root=os.path.join(os.path.dirname(__file__), 'js'))

@dashboard.route('/css/<url:re:.+>')
def send_static_res(url):
  return bottle.static_file(url, root=os.path.join(os.path.dirname(__file__), 'css'))

@dashboard.route('/images/<url:re:.+>')
def send_static_res(url):
  return bottle.static_file(url, root=os.path.join(os.path.dirname(__file__), 'images'))

@dashboard.get("/fetchFromDatabase")
def fetch_from_tango_db(): 
  servers_tree = []
  servers_dict = {}
  tango_db = bottle.request.GET["tango_db"]

  db = DeviceProxy("%s/sys/database/2" % tango_db)
  servers_list = db.DbGetServerList('*')
  for server_list_item in servers_list:
    try:
        server, device = server_list_item.split("/")
    except ValueError:
        continue
    else:
        servers_dict.setdefault(server, []).append(device)
  for server, devices in servers_dict.iteritems():
    node = { "text": server, "nodes":[], "selectable": False }
    servers_tree.append(node)
     
    for device in devices: #device_node in node["nodes"]:
      child_node = { "text": device, "nodes": [], "selectable": False }
      classes = db.DbGetDeviceClassList("%s/%s" % (server, device))
      if classes:
          devices_classes = dict(zip(classes[3::2], classes[2::2]))
          for class_name, dev in devices_classes.iteritems():
            if class_name == "DServer":
              continue
            child_node["nodes"].append({"text": class_name, "selectable": False, "nodes":[{"text":dev}]})
      node["nodes"].append(child_node)

  return json.dumps(servers_tree) #, "levels":1, "nodeIcon":"glyphicon glyphicon-cog" })


@dashboard.get("/retrieveAttributes")
def retrieve_attributes():
  device_fqdn = bottle.request.GET["device_fqdn"]
  print "retrieving attributes from", device_fqdn

  if not device_fqdn in DEVICES:
    device_proxy = DeviceProxy(device_fqdn)
    DEVICES[device_fqdn] = device_proxy
  else:
    device_proxy = DEVICES[device_fqdn]

  attributes_list = [attr.name for attr in device_proxy.attribute_list_query()]

  return json.dumps(attributes_list)


threadsafe_queue = gevent.queue.Queue()

def read_event_from_queue():
  event = AttributeChangeEvent.events_queue.get()
  threadsafe_queue.put(event)

class AttributeChangeEvent:
  ID=0
  events_queue = Queue()
  watcher = gevent.get_hub().loop.async()
  watcher.start(read_event_from_queue)

  def __init__(self):
    AttributeChangeEvent.ID += 1
    self.attr_id = AttributeChangeEvent.ID

  def push_event(self, event):
    AttributeChangeEvent.events_queue.put((self.attr_id, event))
    AttributeChangeEvent.watcher.send()

def pytango_to_python(attribute_value):
  if type(attribute_value) not in (types.StringType, types.IntType, types.FloatType):
    # convert to string any type we don't understand
    return str(attribute_value)
  return attribute_value

def attribute_to_dict(read_attr):
  if read_attr.data_format == PyTango.SPECTRUM:
      data_type = "spectrum"
      if read_attr.dim_y == 0:
        value = list(enumerate(read_attr.value))
      else:
        raise RuntimeError("don't know how to handle spectrum with dim_y>0")
  elif read_attr.data_format == PyTango.SCALAR:
      data_type = "scalar"
      value = pytango_to_python(read_attr.value)
  else:
      data_type="unknown"
      value = pytango_to_python(read_attr.value)
  return { "type": data_type, "value": value }

@dashboard.get("/readAttribute")
def read_attribute():
  device_fqdn =  bottle.request.GET["device_fqdn"]
  attribute_name = bottle.request.GET["attribute"] 
  device_proxy = DEVICES[device_fqdn]
 
  device_state = str(device_proxy.State())  
  attribute_dict = attribute_to_dict(device_proxy.read_attribute(attribute_name))

  attribute_change_ev = AttributeChangeEvent()
  try:
      device_proxy.subscribe_event(attribute_name, PyTango.EventType.CHANGE_EVENT, attribute_change_ev, [])
  except:
      print 'cannot start polling'

  attribute_dict.update({ "state": device_state, "id": id(attribute_change_ev) })
  return json.dumps(attribute_dict)

@dashboard.route("/attributeChanges")
def attribute_changes():
  bottle.response.content_type = "text/event-stream"
  bottle.response.connection = "keep-alive"
  bottle.response.cache_control = "no-cache"
  while True:
    attr_id, new_event = threadsafe_queue.get()
    attribute_dict = attribute_to_dict(new_event.attr_value)
    attribute_dict.update({ "id": attr_id })
    yield "data: %s\n\n" % json.dumps(attribute_dict)

