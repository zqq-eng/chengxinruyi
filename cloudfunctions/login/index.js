const cloud = require('wx-server-sdk')

cloud.init({
  env: 'cloud1-0g7pj3787c240ca6'
})

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  return {
    openid: wxContext.OPENID
  }
}
