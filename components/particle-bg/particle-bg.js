Component({
  properties: {},

  data: {
    stars: []
  },

  lifetimes: {
    attached() {
      this.initStars();
    }
  },

  methods: {
    initStars() {
      const stars = [];
      for (let i = 0; i < 25; i++) {
        stars.push({
          top: Math.random() * 100,   // 0 - 100 vh
          left: Math.random() * 100,  // 0 - 100 vw
          delay: (Math.random() * 3).toFixed(2) // 0 - 3 s
        });
      }
      this.setData({ stars });
    }
  }
});
