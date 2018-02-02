const most = require('most')
const {remote} = require('electron')
const {dialog} = remote

const designActions = (sources) => {
  const designPath$ = most.mergeArray([
    sources.dom.select('#fileLoader').events('click')
      .map(function () {
        const paths = dialog.showOpenDialog({properties: ['openFile', 'openDirectory', 'multiSelections']})
        return paths
      }),
    sources.store
      .map(data => data.design.mainPath)
      .filter(data => data !== '')
      .map(data => [data]),
    sources.drops
      .filter(drop => drop.type === 'fileOrFolder' && drop.data.length > 0)
      .map(drop => drop.data.map(fileOrFolder => fileOrFolder.path))
  ])
    .filter(data => data !== undefined)
    .debounce(50)
    .multicast()

  const setDesignPath$ = designPath$
    .map(data => ({type: 'setDesignPath', data}))
    .delay(1)

  const setDesignContent$ = most.mergeArray([
    sources.fs.filter(data => data.operation === 'read').map(raw => raw.data),
    sources.watcher.map(({filePath, contents}) => contents)
  ])
    .map(data => ({type: 'setDesignContent', data}))

  // design parameter change actions
  const updateDesignFromParams$ = most.mergeArray([
    sources.dom.select('#updateDesignFromParams').events('click')
      .map(function () {
        const controls = Array.from(document.getElementById('paramsMain').getElementsByTagName('input'))
          .concat(Array.from(document.getElementById('paramsMain').getElementsByTagName('select')))
        const paramValues = require('../core/getParameterValues')(controls)
        return {paramValues, origin: 'manualUpdate'}
      })
      .multicast(),
    sources.paramChanges.multicast().map(function (_controls) {
      // FIXME: clunky
      try {
        const controls = Array.from(document.getElementById('paramsMain').getElementsByTagName('input'))
          .concat(Array.from(document.getElementById('paramsMain').getElementsByTagName('select')))
        const paramValues = require('../core/getParameterValues')(controls)
        return {paramValues, origin: 'instantUpdate'}
      } catch (error) {
        return {error, origin: 'instantUpdate'}
      }
    })

  ])
  .map(data => ({type: 'updateDesignFromParams', data})).multicast()

  const setDesignSolids$ = most.mergeArray([
    sources.solidWorker
      .filter(event => !('error' in event))
      .map(function (event) {
        try {
          if (event.data instanceof Object) {
            const { CAG, CSG } = require('@jscad/csg')
            const solids = event.data.solids.map(function (object) {
              if (object['class'] === 'CSG') { return CSG.fromCompactBinary(object) }
              if (object['class'] === 'CAG') { return CAG.fromCompactBinary(object) }
            })
            const {paramDefaults, paramValues, paramDefinitions} = event.data
            return {solids, paramDefaults, paramValues, paramDefinitions}
          }
        } catch (error) {
          return {error}
        }
      })
  ])
    .map(data => ({type: 'setDesignSolids', data}))

  const timeOutDesignGeneration$ = designPath$
    .delay(60000)
    .map(data => ({type: 'timeOutDesignGeneration', data}))
    .tap(x => console.log('timeOutDesignGeneration'))

  return {
    setDesignPath$,
    setDesignContent$,
    updateDesignFromParams$,
    timeOutDesignGeneration$,
    setDesignSolids$
  }
}

module.exports = designActions