import { NativeModules, DeviceEventEmitter } from 'react-native'
import { EventEmitter } from 'events'

const RNZeroconf = NativeModules.RNZeroconf

const RESOLUTION_TIME_INTERVAL = 1000;
const CURRENT_INDEX_BEING_RESOLVED = 0;

export default class Zeroconf extends EventEmitter {

  constructor (props) {
    console.log("[JSWRAPPER]RNZeroConf::constructor");
    super(props)
    this._services = {}
    this._resolvedServices = {}
    this._dListeners = {}
    this._servicesToBeResolved = [];
    this._onGoingResolution = false;
    this._onGoingResolutionTimeStamp = 0;
    this._type = '';
    this._protocol= '';
    this._domain = '';
    
    this.addDeviceListeners();
    this.checkServicesToBeResolved();
    this._checkIfNativeModuleHasFrozen();
  }

  /**
   * Add all event listeners
   */
  addDeviceListeners () {
    console.log("[JSWRAPPER]RNZeroConf::addDeviceListeners");
    if (Object.keys(this._dListeners).length) {
      console.log("[JSWRAPPER]RNZeroConf::addDeviceListeners: listeners already in place");
      return this.emit('errorEvent', 'RNZeroconf listeners already in place.')
    }

    this._dListeners.start = DeviceEventEmitter.addListener('RNZeroconfStart', () => this.emit('start'))

    this._dListeners.stop = DeviceEventEmitter.addListener('RNZeroconfStop', () => {
      console.log("[JSWRAPPER]RNZeroConf::RNZeroconfStop:");
      this.emit('stop')
    
    })

    this._dListeners.error = DeviceEventEmitter.addListener('RNZeroconfError', (err) => {
      console.log("[JSWRAPPER]RNZeroConf::RNZeroconfError:");
      this.emit('errorEvent', err)
    
    })
    
    this._dListeners.found = DeviceEventEmitter.addListener('RNZeroconfResolveFailed', (service) => {
      console.log("[JSWRAPPER]RNZeroConf::RNZeroconfResolveFailed:", service);

      // En ciertos casos (ej. cambios de IP, que desaparezca sin poder hacer un BYE...etc.), podría quedarse infinitamente intentando resolver un service.
      // De esta forma, en cuanto no consiga resolver un service, lo pasará al final de la lista de pendientes de resolver, con el objetivo de no bloquear al resto de servicios pendientes.
      const currentTransactionService = this._servicesToBeResolved[CURRENT_INDEX_BEING_RESOLVED];
      this._servicesToBeResolved.splice(CURRENT_INDEX_BEING_RESOLVED, 1);
      this._servicesToBeResolved.push(currentTransactionService);

      // Put ongoing to false, as is available again to continue resolving
      //this._onGoingResolution = false;
      this._finishOnGoingTransaction();
    })

    this._dListeners.found = DeviceEventEmitter.addListener('RNZeroconfFound', (service) => {
      console.log("[JSWRAPPER]RNZeroConf::RNZeroconfFound:", service);
      const { name } = service

      this._services[name] = service
      this.emit('found', this._resolvedServices)

      // Lógica para resolver los servicios nada más recibirlos
      this._servicesToBeResolved.push(service);
    })

    this._dListeners.remove = DeviceEventEmitter.addListener('RNZeroconfRemove', (service) => {
      const { name } = service
      
      console.log("[JSWRAPPER]RNZeroConf::RNZeroconfRemove:"+name+" ", service);
      delete this._services[name]
      //TODO: Revisar si podríamos borrar algún elemento que no esté; asegurarse de que existe previamente.
      delete this._resolvedServices[name]

      // Remove from pending to remove

      this.emit('remove', this._resolvedServices)
    })

    this._dListeners.resolved = DeviceEventEmitter.addListener('RNZeroconfResolved', (service) => {
      console.log("[JSWRAPPER]RNZeroConf::RNZeroconfResolved:", service);
      this._resolvedServices[service.name] = service
      
      // Removes the first element selected in CURRENT_INDEX_BEING_RESOLVED of _servicesToBeResolved.
      this._servicesToBeResolved.splice(CURRENT_INDEX_BEING_RESOLVED, 1);

      console.log("[JSWRAPPER]RNZeroConf::RNZeroconfResolved: _resolvedServices:", JSON.stringify(this._resolvedServices));
      this.emit('resolved', this._resolvedServices)

      // Put ongoing to false, as is available again to continue resolving
      //this._onGoingResolution = false;
      this._finishOnGoingTransaction();
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
    console.log("[JSWRAPPER]RNZeroConf::checkServicesToBeResolved initialized");
    let outerThis = this;
    //Cada segundo manda a resolver
    setInterval(function(){
        console.log("[JSWRAPPER]RNZeroConf::checkServicesToBeResolved: fired");
        if(outerThis._onGoingResolution === false){
          console.log("[JSWRAPPER]RNZeroConf::checkServicesToBeResolved: ongoinResolution=false");
            if(outerThis._servicesToBeResolved.length > 0){
              console.log("[JSWRAPPER]RNZeroConf::checkServicesToBeResolved:_onGoingResolution=false. Pending resolutions "+outerThis._servicesToBeResolved.length, JSON.stringify(outerThis._servicesToBeResolved));
              console.log("[JSWRAPPER]RNZeroConf::checkServicesToBeResolved:_onGoingResolution=false. Is going to resolve... ", JSON.stringify(outerThis._servicesToBeResolved[CURRENT_INDEX_BEING_RESOLVED]));
              outerThis._startOnGoingTransaction();
              RNZeroconf.resolve(outerThis._servicesToBeResolved[CURRENT_INDEX_BEING_RESOLVED].name)
            }
        }
    }, 500);
  } 

  _checkIfNativeModuleHasFrozen () {
    let outerThis = this;
    setInterval(function(){
      console.log("[JSWRAPPER]RNZeroConf::_checkIfNativeModuleHasFrozen: fired");
      if(outerThis._onGoingResolution){
        console.log("[JSWRAPPER]RNZeroConf::_checkIfNativeModuleHasFrozen: _onGoingResolution true");
        const currentTimestamp = new Date();
        const timeSpentInOnGoingTransaction = currentTimestamp - outerThis._onGoingResolutionTimeStamp;
        if(timeSpentInOnGoingTransaction > 20000){
          console.log("[JSWRAPPER]RNZeroConf:: transaction >= 10 seconds. DESTROYING RNZEROCONF NATIVE MODULE");
          this.crash();
          /*
          outerThis.stop();
          //TODO: Ver cómo mejorar esto esperando a un evento stop desde JAVA.
          setTimeout(function(){
            outerThis._onGoingResolution = false;
            //outerThis.scan(outerThis._type, outerThis._protocol, outerThis._domain);
          }, 5000); */
        }
      }
    }, 10000);
  }

  _finishOnGoingTransaction() {
    let outerThis = this;
    setTimeout(function(){
      console.log("[JSWRAPPER]RNZeroConf::_finishOnGoingTransaction executed");
      outerThis._onGoingResolution = false;
    }, RESOLUTION_TIME_INTERVAL);
  }

  _startOnGoingTransaction(){
    this._onGoingResolution = true;
    this._onGoingResolutionTimeStamp = new Date();
  }

}
