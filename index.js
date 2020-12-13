const App = require("@live-change/framework")
const app = new App()
const validators = require('../validation')

require('../../i18n/ejs-require.js')
const i18n = require('../../i18n')

const definition = app.createServiceDefinition({
  name: 'categories',
  validators
})

const Picture = definition.foreignModel('pictures', 'Picture')

const translationProperties = {}
for(let lang in i18n.languages) {
  translationProperties[lang] = {
    type: Object,
    properties: {
      name: {
        type: String
      },
      description: {
        type: String,
        editor: 'textarea'
      }
    }
  }
}

const categoryFields = {
  name: {
    type: String,
    validation: ['nonEmpty']
  },
  description: {
    type: String,
    editor: 'textarea'
  },
  order: {
    type: Number
  },
  translations: {
    type: Object,
    properties: translationProperties
  },
  picture: {
    type: Picture
  },
  slug: {
    type: String
  }
}

let Category = definition.model({
  name: "Category",
  properties: {
    ...categoryFields
  },
  indexes: {
    subcategories: {
      property: "parent"
    },
  },
  crud: {
    deleteTrigger: true,
    writeOptions: {
      slug: {
        field: "slug",
        from: "name",
        hard: true
      },
      access: (params, {client, service}) => {
        return client.roles && client.roles.includes('admin')
      }
    }
  }
})

Category.createAndAddProperty('parent', {
  type: Category
})
categoryFields['parent'] = {
  type: Category
}

definition.action({
  name: "CategoryCreate",
  properties: {
    ...categoryFields
  },
  access: (params, { client }) => {
    return client.roles && client.roles.includes('admin')
  },
  async execute (params, { client, service }, emit) {
    const category = app.generateUid()
    let data = { }
    for(let key in categoryFields) {
      data[key] = params[key]
    }

    if(!data.slug) {
      data.slug = await service.triggerService('slugs', {
        type: "CreateSlug",
        group: "category",
        title: params.name,
        to: category
      })
    } else {
      try {
        await service.triggerService('slugs', {
          type: "TakeSlug",
          group: "category",
          path: data.slug,
          to: category
        })
      } catch(e) {
        throw { properties: { slug: 'taken' } }
      }
    }

    emit({
      type: 'CategoryCreated',
      category,
      data: data
    })

    return category
  }
})

definition.action({
  name: "CategoryUpdate",
  properties: {
    category: {
      type: String
    },
    ...categoryFields
  },
  access: (params, { client }) => {
    return client.roles && client.roles.includes('admin')
  },
  async execute (params, { client, service }, emit) {
    let data = { }
    for(let key in categoryFields) {
      data[key] = params[key]
    }

    const category = params.category

    let current = await Category.get(category)

    if(current.slug != data.slug) {
      await service.triggerService('slugs', {
        type: "ReleaseSlug",
        group: "category",
        path: current.slug,
        to: category
      })
      if (!data.slug) {
        data.slug = await service.triggerService('slugs', {
          type: "CreateSlug",
          group: "category",
          title: params.name,
          to: category
        })
      } else {
        try {
          await service.triggerService('slugs', {
            type: "TakeSlug",
            group: "category",
            path: data.slug,
            to: category
          })
        } catch (e) {
          throw {properties: {slug: 'taken'}}
        }
      }
    }

    emit({
      type: 'CategoryUpdated',
      category,
      data: data
    })

    return category
  }
})

definition.action({
  name: "CategoryDelete",
  properties: {
    category: {
      type: String
    }
  },
  access: (params, { client }) => {
    return client.roles && client.roles.includes('admin')
  },
  async execute ({ category }, { client, service }, emit) {
    let current = await Category.get(category)
    await service.triggerService('slugs', {
      type: "ReleaseSlug",
      group: "category",
      path: current.slug,
      to: category
    })
    await service.trigger({
      type: "CategoryDeleted",
      category
    })
    emit({
      type: 'CategoryDeleted',
      category
    })
  }
})

definition.view({
  name: "subcategories",
  properties: {
    category: {
      type: Category
    }
  },
  returns: {
    type: Array,
    of: {
      type: Category
    }
  },
  daoPath({ category }, {client, service}, method) {
    //console.error("AP PATH", Category.indexRangePath("subcategories", [category]))
    return Category.indexRangePath("subcategories", [category])
  }
})



module.exports = definition

async function start () {
  app.processServiceDefinition(definition, [...app.defaultProcessors])
  await app.updateService(definition)//, { force: true })
  const service = await app.startService(definition,
      { runCommands: true, handleEvents: true, indexSearch: true })

  if(!(await Category.get('root'))) {
    Category.create({
      id: 'root',
      name: 'root'
    })
  }

  /*require("../config/metricsWriter.js")(definition.name, () => ({

  }))*/
}

if (require.main === module) start().catch(error => {
  console.error(error)
  process.exit(1)
})

process.on('unhandledRejection', (reason, p) => {
  console.log('Unhandled Rejection at: Promise', p, 'reason:', reason)
})

