import { NativeModules, DeviceEventEmitter } from 'react-native'
import { EventEmitter } from 'events'

const RNZeroconf = NativeModules.RNZeroconf

const RESOLUTION_TIME_INTERVAL = 500;
const CURRENT_INDEX_BEING_RESOLVED = 0;

export default class Zeroconf extends EventEmitter {

  constructor (props) {
    super(props)

    this._services = {}
    this._resolvedServices = {}
    this._dListeners = {}
    this._servicesToBeResolved = [];
    this._onGoingResolution = false;
    this._type = '';
    this._protocol= '';
    this._domain = '';
    
    console.log("[JSWRAPPER]RNZeroConf::constructor");

    this.addDeviceListeners();
    this.checkServicesToBeResolved();
  }

  /**
   * Add all event listeners
   */
  addDeviceListeners () {

    console.log("[JSWRAPPER]RNZeroConf::addDeviceListeners");
    if (Object.keys(this._dListeners).length) {
      return this.emit('errorEvent', 'RNZeroconf listeners already in place.')
    }

    this._dListeners.start = DeviceEventEmitter.addListener('RNZeroconfStart', () => this.emit('start'))
    this._dListeners.stop = DeviceEventEmitter.addListener('RNZeroconfStop', () => this.emit('stop'))

    this._dListeners.error = DeviceEventEmitter.addListener('RNZeroconfError', (err) => this.emit('errorEvent', err))
    
    this._dListeners.found = DeviceEventEmitter.addListener('RNZeroconfResolveFailed', service => {
      console.log("[JSWRAPPER]RNZeroConf::RNZeroconfResolveFailed:", service);

      // En ciertos casos (ej. cambios de IP, que desaparezca sin poder hacer un BYE...etc.), podría quedarse infinitamente intentando resolver un service.
      // De esta forma, en cuanto no consiga resolver un service, lo pasará al final de la lista de pendientes de resolver, con el objetivo de no bloquear al resto de servicios pendientes.
      const currentTransactionService = this._servicesToBeResolved[CURRENT_INDEX_BEING_RESOLVED];
      this._servicesToBeResolved.splice(CURRENT_INDEX_BEING_RESOLVED, 1);
      this._servicesToBeResolved.push(currentTransactionService);

      // Put ongoing to false, as is available again to continue resolving
      this._onGoingResolution = false;
    })

    this._dListeners.found = DeviceEventEmitter.addListener('RNZeroconfFound', service => {
      console.log("[JSWRAPPER]RNZeroConf::RNZeroconfFound:", service);
      const { name } = service

      this._services[name] = service
      this.emit('found', this._resolvedServices)

      // Lógica para resolver los servicios nada más recibirlos
      this._servicesToBeResolved.push(service);
    })

    this._dListeners.remove = DeviceEventEmitter.addListener('RNZeroconfRemove', service => {
      const { name } = service

      console.log("[JSWRAPPER]RNZeroConf::RNZeroconfRemove:"+name+" ", service);
      delete this._services[name]
      //TODO: Revisar si podríamos borrar algún elemento que no esté; asegurarse de que existe previamente.
      delete this._resolvedServices[name]

      // Remove from pending to remove

      this.emit('remove', this._resolvedServices)
    })

    this._dListeners.resolved = DeviceEventEmitter.addListener('RNZeroconfResolved', service => {
      console.log("[JSWRAPPER]RNZeroConf::RNZeroconfResolved:", service);
      this._resolvedServices[service.name] = service
      
      // Removes the first element selected in CURRENT_INDEX_BEING_RESOLVED of _servicesToBeResolved.
      this._servicesToBeResolved.splice(CURRENT_INDEX_BEING_RESOLVED, 1);

      // Put ongoing to false, as is available again to continue resolving
      this._onGoingResolution = false;

      this.emit('resolved', this._resolvedServices)
    })

  }

  /**
   * Remove all event listeners and clean map
   */
  removeDeviceListeners () {
    Object.keys(this._dListeners).forEach(name => this._dListeners[name].remove())
    this._dListeners = {}
  }

  /**
   * Get all the services fully resolved or not
   */
  getServices () {
    return this._services
  }

  /**
   * Get all the services fully resolved
   */
  getResolvedServices () {
    return this._resolvedServices
  }

  /**
   * Scan for Zeroconf services,
   * Defaults to _http._tcp. on local domain
   */
  scan (type = 'http', protocol = 'tcp', domain = 'local.') {
    this._services = {}
    this._resolvedServices = {}
    this._type = type;
    this._protocol = protocol;
    this._domain = domain;
    this.emit('start')
    RNZeroconf.scan(type, protocol, domain)
  }

  /**
   * Stop current scan if any
   */
  async stop () {
      console.log("[JSWRAPPER]RNZeroConf::stop()");
      await RNZeroconf.stop()
  }

  /**
   * Check if there are services to be resolved
   */
  checkServicesToBeResolved () {
    console.log("[JSWRAPPER]RNZeroConf::checkServicesToBeResolved");
    let outerThis = this;
    //Cada segundo manda a resolver
    setInterval(function(){
        if(outerThis._onGoingResolution === false){
          console.log("[JSWRAPPER]RNZeroConf::checkServicesToBeResolved: services to be resolved", JSON.stringify(outerThis._servicesToBeResolved));
            if(outerThis._servicesToBeResolved.length > 0){
              console.log("[JSWRAPPER]RNZeroConf::checkServicesToBeResolved:_onGoingResolution=false. Resolving... ", outerThis._servicesToBeResolved[CURRENT_INDEX_BEING_RESOLVED]);
              outerThis._onGoingResolution = true;
              RNZeroconf.resolve(outerThis._servicesToBeResolved[CURRENT_INDEX_BEING_RESOLVED].name)
            }
        }
    }, RESOLUTION_TIME_INTERVAL);
  } 

}
