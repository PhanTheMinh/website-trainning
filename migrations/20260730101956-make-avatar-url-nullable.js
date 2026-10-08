'use strict'

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn('users', 'avatar_url', {
      type: Sequelize.STRING(255),
      allowNull: true
    })

    await queryInterface.bulkUpdate(
        'users',
        { avatar_url: null },
        { avatar_url: '' }
    )
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkUpdate(
        'users',
        { avatar_url: '' },
        { avatar_url: null }
    )

    await queryInterface.changeColumn('users', 'avatar_url', {
      type: Sequelize.STRING(255),
      allowNull: false
    })
  }
}