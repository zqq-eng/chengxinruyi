// 云函数：自动解析视频信息（时长）
const cloud = require('wx-server-sdk')
cloud.init()

const axios = require('axios')
const ffprobe = require('ffprobe')
const ffprobeStatic = require('ffprobe-static')

exports.main = async (event) => {
  const { fileID } = event

  const res = await cloud.getTempFileURL({
    fileList: [fileID]
  })

  const url = res.fileList[0].tempFileURL

  // 使用 ffprobe 获取视频时长
  const info = await ffprobe(url, { path: ffprobeStatic.path })

  const duration = Math.floor(info.streams[0].duration || 0)

  return {
    duration
  }
}
