const app = getApp()
const db = wx.cloud.database()

let audioCtx = null
let sleepTimer = null

// 允许的音频后缀
const AUDIO_EXTS = ["mp3", "m4a", "aac", "wav", "flac", "ogg"]

// iOS / Android 判断
const systemInfo = wx.getSystemInfoSync()
const isIOS = systemInfo.platform === "ios"

Page({
  data: {
    myAudioList: []
  },

  onShow() {
    this.loadMyAudio()
  },

  /* ========= 读取我的音乐 ========= */
  async loadMyAudio() {
    if (!app.globalData.openid) return

    try {
      const res = await db
        .collection("sleep_music")
        .where({ openid: app.globalData.openid })
        .orderBy("createdAt", "desc")
        .limit(50)
        .get()

      this.setData({ myAudioList: res.data || [] })
    } catch (e) {
      console.error("loadMyAudio error", e)
    }
  },

  /* ========= 上传入口：本地 ========= */
  chooseAudioLocal() {
    wx.showToast({ title: "请选择手机本地音频", icon: "none" })
    this.chooseAudioCommon()
  },

  /* ========= 上传入口：聊天 ========= */
  chooseAudioChat() {
    wx.showToast({ title: "请选择聊天里的音频文件", icon: "none" })
    this.chooseAudioCommon()
  },

  /* ========= 通用上传逻辑 ========= */
  chooseAudioCommon() {
    if (!app.globalData.openid) {
      wx.showToast({ title: "请先登录", icon: "none" })
      return
    }

    wx.chooseMessageFile({
      count: 1,
      type: "file",
      success: async (res) => {
        const file = res.tempFiles && res.tempFiles[0]
        if (!file) return

        const name = file.name || "助眠音乐"
        const ext = (name.split(".").pop() || "").toLowerCase()

        if (AUDIO_EXTS.indexOf(ext) === -1) {
          wx.showToast({ title: "只能上传音频文件", icon: "none" })
          return
        }

        wx.showLoading({ title: "上传中...", mask: true })

        try {
          const cloudPath =
            `sleep/${app.globalData.openid}/${Date.now()}_${Math.floor(Math.random() * 10000)}.${ext}`

          const upRes = await wx.cloud.uploadFile({
            cloudPath,
            filePath: file.path
          })

          await db.collection("sleep_music").add({
            data: {
              openid: app.globalData.openid,
              name,
              fileID: upRes.fileID,
              createdAt: db.serverDate()
            }
          })

          wx.hideLoading()
          wx.showToast({ title: "上传成功", icon: "success" })
          this.loadMyAudio()
        } catch (err) {
          console.error("upload error", err)
          wx.hideLoading()
          wx.showToast({ title: "上传失败", icon: "none" })
        }
      }
    })
  },

  /* ========= ▶ 播放（iOS 兼容核心） ========= */
  playAudio(e) {
    const fileID = e.currentTarget.dataset.url
    if (!fileID) return

    wx.cloud.getTempFileURL({
      fileList: [fileID],
      success: (res) => {
        const info = res.fileList && res.fileList[0]
        if (!info || info.status) {
          wx.showToast({ title: "无法播放", icon: "none" })
          return
        }

        this.clearSleepTimer()

        // 🔴 销毁旧实例（iOS 尤其重要）
        if (audioCtx) {
          try {
            audioCtx.stop()
            audioCtx.destroy()
          } catch (e) {}
          audioCtx = null
        }

        // ✅ 创建新音频上下文（用户点击触发，满足 iOS 要求）
        audioCtx = wx.createInnerAudioContext()

        // ✅ iOS 音频关键兼容
        if (isIOS) {
          try {
            wx.setInnerAudioOption({
              obeyMuteSwitch: false,   // 不服从静音键
              mixWithOther: true
            })
            audioCtx.obeyMuteSwitch = false
          } catch (e) {}
        }

        audioCtx.loop = true
        audioCtx.src = info.tempFileURL

        // ⚠️ iOS 必须等 canplay 再 play
        audioCtx.onCanplay(() => {
          setTimeout(() => {
            audioCtx.play()
          }, isIOS ? 200 : 0)
        })

        audioCtx.onError((err) => {
          console.error("audio error", err)
          wx.showToast({ title: "播放失败", icon: "none" })
        })

        wx.showToast({ title: "开始播放（自动循环）", icon: "none" })

        this.askSleepTimer()
      }
    })
  },

  /* ========= ⏰ 定时停止 ========= */
  askSleepTimer() {
    wx.showActionSheet({
      itemList: [
        "不定时（一直播放）",
        "15 分钟后停止",
        "30 分钟后停止",
        "60 分钟后停止"
      ],
      success: (res) => {
        const idx = res.tapIndex
        if (idx === 0) {
          wx.showToast({ title: "已设置：不定时播放", icon: "none" })
          return
        }

        const minutes = idx === 1 ? 15 : idx === 2 ? 30 : 60
        this.setSleepTimer(minutes)
      }
    })
  },

  setSleepTimer(minutes) {
    this.clearSleepTimer()

    sleepTimer = setTimeout(() => {
      if (audioCtx) {
        audioCtx.stop()
      }
      wx.showToast({
        title: "音乐已自动停止，晚安 🌙",
        icon: "none",
        duration: 3000
      })
    }, minutes * 60 * 1000)

    wx.showToast({
      title: `将在 ${minutes} 分钟后停止`,
      icon: "none"
    })
  },

  clearSleepTimer() {
    if (sleepTimer) {
      clearTimeout(sleepTimer)
      sleepTimer = null
    }
  },

  /* ========= 🗑 删除 ========= */
  deleteAudio(e) {
    const id = e.currentTarget.dataset.id
    const fileID = e.currentTarget.dataset.fileid
    if (!id) return

    wx.showModal({
      title: "确认删除？",
      content: "删除后不可恢复",
      success: async (res) => {
        if (!res.confirm) return

        wx.showLoading({ title: "删除中..." })

        try {
          this.clearSleepTimer()
          if (audioCtx) {
            audioCtx.stop()
            audioCtx.destroy()
            audioCtx = null
          }

          if (fileID) {
            await wx.cloud.deleteFile({ fileList: [fileID] })
          }

          await db.collection("sleep_music").doc(id).remove()

          wx.hideLoading()
          wx.showToast({ title: "已删除", icon: "success" })
          this.loadMyAudio()
        } catch (err) {
          console.error("delete error", err)
          wx.hideLoading()
          wx.showToast({ title: "删除失败", icon: "none" })
        }
      }
    })
  },

  onUnload() {
    this.clearSleepTimer()
    if (audioCtx) {
      audioCtx.stop()
      audioCtx.destroy()
      audioCtx = null
    }
  }
})
