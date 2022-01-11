module.exports = function(sequelize, DataTypes) {
  // return queryInterface.sequelize.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";').then(()=>{
	return sequelize.define('otp', {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      otp: DataTypes.STRING,
      expiration_time: DataTypes.DATE,
      verified: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        allowNull: true
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: sequelize.fn('now')
      },
      updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: sequelize.fn('now')
      }     
    });
//  });
};