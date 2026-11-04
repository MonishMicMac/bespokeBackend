import { Op } from "sequelize";
import sequelize from "../../config/db.js";
import {
  Measurement,
  CustomerMeasurement,
  CustomerMeasurementName,
  UserLogin,
} from "../../models/setupAssociations.js";
import { buildFileUrl } from "../utils/fileUrl.js";

/**
 * Service to manage customer measurements, profiles, and measurement schemas.
 * Ported faithfully from Laravel: App\Http\Controllers\api\CustomerMeasurementController
 */

/**
 * API 1: Show Measurement List with optional customer ID / gender / profile filtering
 * Method: CustomerMeasurementController::getMeasurementList()
 * GET /api/customer-measurement/list
 */
export async function getMeasurementList({
  gender,
  type,
  userId,
  custId,
  customerId,
  customerMeasurementNameId,
  nameId,
}) {
  let effectiveCustId = custId || customerId || userId || null;
  let genderInput = gender !== undefined && gender !== "" ? gender : (type !== undefined && type !== "" ? type : null);
  let measNameId = customerMeasurementNameId || nameId || null;

  // 1. If profile ID is provided, look up profile info
  if (measNameId) {
    const measProfile = await CustomerMeasurementName.findByPk(measNameId);
    if (measProfile) {
      if (!effectiveCustId) {
        effectiveCustId = measProfile.user_id;
      }
      if (genderInput === null || genderInput === "") {
        genderInput = measProfile.gender;
      }
    }
  }

  // 2. If customer ID is provided, look up gender from user_login table
  if (effectiveCustId && (genderInput === null || genderInput === "")) {
    const user = await UserLogin.findByPk(effectiveCustId);
    if (user && user.gender) {
      genderInput = user.gender;
    }
  }

  // 3. Gender resolution & mapping
  let genderId = null;
  if (genderInput !== null && genderInput !== "") {
    const genderMap = {
      "1": 1,
      men: 1,
      man: 1,
      male: 1,
      "2": 2,
      women: 2,
      woman: 2,
      female: 2,
      other: 2,
      others: 2,
      "3": 3,
      kid: 3,
      kids: 3,
      child: 3,
      children: 3,
      "4": 4,
    };

    const genderKey = String(genderInput).trim().toLowerCase();
    if (genderMap[genderKey] !== undefined) {
      genderId = genderMap[genderKey];
    } else if (!isNaN(genderInput) && genderInput !== "") {
      genderId = parseInt(genderInput, 10);
    }
  }

  // 4. Fetch customer's saved measurements if customer or profile ID is given
  let customerMeasurements = [];
  if (measNameId) {
    customerMeasurements = await CustomerMeasurement.findAll({
      where: { customer_measurement_name_id: measNameId },
    });
  } else if (effectiveCustId) {
    customerMeasurements = await CustomerMeasurement.findAll({
      where: { cust_id: effectiveCustId },
    });
  }

  const customerMeasurementsMap = new Map();
  customerMeasurements.forEach((cm) => {
    customerMeasurementsMap.set(Number(cm.measurement_id), cm);
  });

  // 5. Build master measurements query
  const whereClause = { action: 0 };
  if (genderId !== null && genderId !== undefined) {
    whereClause.type = genderId;
  }

  // When customer ID or profile is given, only show the measurements that exist for this customer
  if (effectiveCustId || measNameId) {
    const savedMasterIds = Array.from(customerMeasurementsMap.keys());
    whereClause.id = savedMasterIds.length > 0 ? savedMasterIds : [0]; // Empty match if no saved measurements
  }

  const masterList = await Measurement.findAll({
    where: whereClause,
    order: [["id", "ASC"]],
  });

  // 6. Format measurements
  const measurements = masterList.map((item) => {
    const fullImageUrl = item.img_path ? buildFileUrl(item.img_path) : null;
    const custMeas = customerMeasurementsMap.get(Number(item.id));

    let val = 0;
    let custMeasurementId = 0;

    if (custMeas) {
      val = !isNaN(custMeas.value) ? parseInt(custMeas.value, 10) : custMeas.value;
      custMeasurementId = Number(custMeas.id);
    } else if (item.value !== null && item.value !== undefined) {
      val = !isNaN(item.value) ? parseInt(item.value, 10) : item.value;
    }

    return {
      id: Number(item.id),
      name: item.name,
      value: val,
      cust_measurement_id: Number(custMeasurementId ?? 0),
      customer_measurement_name_id:
        custMeas && custMeas.customer_measurement_name_id
          ? Number(custMeas.customer_measurement_name_id)
          : null,
      image: fullImageUrl,
    };
  });

  return {
    statusCode: 200,
    body: {
      status: true,
      message: "Measurement list retrieved successfully.",
      data: measurements,
    },
  };
}

/**
 * API 2: View Customer Measurements by cust_id / user_id
 * Method: CustomerMeasurementController::show()
 * GET /api/customer-measurement/view/:user_id
 */
export async function showCustomerMeasurements({
  userId,
  custId,
  customerMeasurementNameId,
  nameId,
  authenticatedUserId,
}) {
  const effectiveCustId = userId || custId;
  const filterProfileId = customerMeasurementNameId || nameId || null;

  // Security check: Must not allow accessing another user's measurements
  if (authenticatedUserId && String(authenticatedUserId) !== String(effectiveCustId)) {
    return {
      statusCode: 403,
      body: {
        status: false,
        message: "Unauthorized: You can only view your own measurements.",
        data: [],
      },
    };
  }

  // 1. Fetch customer measurements
  const measWhere = { cust_id: effectiveCustId };
  if (filterProfileId) {
    measWhere.customer_measurement_name_id = filterProfileId;
  }

  const measurements = await CustomerMeasurement.findAll({
    where: measWhere,
    include: [{ model: CustomerMeasurementName, as: "measurementName" }],
  });

  if (measurements.length === 0) {
    return {
      statusCode: 404,
      body: {
        status: false,
        message: "No measurements found for this customer.",
        data: [],
      },
    };
  }

  // 2. Fetch customer profiles
  const profileWhere = { user_id: effectiveCustId };
  if (filterProfileId) {
    profileWhere.id = filterProfileId;
  }

  const profiles = await CustomerMeasurementName.findAll({
    where: profileWhere,
  });

  // 3. Format individual measurement rows
  const formattedData = measurements.map((item) => ({
    cust_measurement_id: Number(item.id),
    customer_measurement_name_id: item.customer_measurement_name_id
      ? Number(item.customer_measurement_name_id)
      : null,
    measurement_id: Number(item.measurement_id),
    value: !isNaN(item.value) ? parseInt(item.value, 10) : item.value,
    profile_name: item.measurementName ? item.measurementName.name : null,
    gender: item.measurementName ? item.measurementName.gender : null,
  }));

  // 4. Group measurements by profile ID
  const measurementsByProfile = new Map();
  formattedData.forEach((item) => {
    const pId = item.customer_measurement_name_id;
    if (pId) {
      if (!measurementsByProfile.has(pId)) {
        measurementsByProfile.set(pId, []);
      }
      measurementsByProfile.get(pId).push(item);
    }
  });

  // 5. Attach measurements to each profile
  const formattedProfiles = profiles.map((profile) => {
    const profileData = profile.toJSON();
    profileData.measurements = measurementsByProfile.get(profile.id) || [];
    return profileData;
  });

  return {
    statusCode: 200,
    body: {
      status: true,
      message: "Customer measurements fetched successfully.",
      data: {
        cust_id: Number(effectiveCustId),
        user_id: Number(effectiveCustId),
        profiles: formattedProfiles,
      },
    },
  };
}

/**
 * API 3: Create Customer Measurement Profile & Add Bulk Measurements
 * Method: CustomerMeasurementController::store()
 * POST /api/customer-measurement/create
 */
export async function createCustomerMeasurements({ userId, data = {}, authenticatedUserId }) {
  const effectiveUserId = userId || data.user_id || data.cust_id;
  const measNameInput = data.name || data.profile_name || null;
  const gender = data.gender || null;
  let measNameId = data.customer_measurement_name_id || data.name_id || null;

  // 1. Validation
  const errors = {};
  if (!effectiveUserId) {
    errors.resolved_user_id = ["The user_id or cust_id field is required."];
  }

  // Security Check: customer ownership
  if (authenticatedUserId && effectiveUserId && String(authenticatedUserId) !== String(effectiveUserId)) {
    return {
      statusCode: 403,
      body: {
        status: false,
        message: "Unauthorized: You can only create measurements for yourself.",
        errors: { user_id: ["Unauthorized user."] },
      },
    };
  }

  const measurementsList = data.measurement || data.measurements;
  if (!measurementsList || !Array.isArray(measurementsList) || measurementsList.length === 0) {
    errors.measurements = ["The measurements field is required and must be an array."];
  } else {
    for (let i = 0; i < measurementsList.length; i++) {
      const m = measurementsList[i];
      if (!m || m.measurement_id === undefined || m.measurement_id === null || isNaN(m.measurement_id)) {
        errors[`measurements.${i}.measurement_id`] = ["The measurement_id field is required and must be an integer."];
      }
      if (!m || m.value === undefined || m.value === null || m.value === "") {
        errors[`measurements.${i}.value`] = ["The value field is required."];
      }
    }
  }

  if (Object.keys(errors).length > 0) {
    return {
      statusCode: 422,
      body: {
        status: false,
        message: "Validation error",
        errors,
      },
    };
  }

  // 2. Validate measurement IDs exist in master measurements
  const submittedIds = measurementsList.map((m) => Number(m.measurement_id));
  const validMasters = await Measurement.findAll({
    where: { id: submittedIds, action: 0 },
  });
  const validMasterIds = new Set(validMasters.map((m) => Number(m.id)));

  for (let i = 0; i < submittedIds.length; i++) {
    if (!validMasterIds.has(submittedIds[i])) {
      return {
        statusCode: 422,
        body: {
          status: false,
          message: "Validation error",
          errors: {
            [`measurements.${i}.measurement_id`]: [
              `Measurement ID ${submittedIds[i]} does not exist or is inactive.`,
            ],
          },
        },
      };
    }
  }

  // 3. Profile ownership check if existing profile ID provided
  if (measNameId) {
    const existingProfile = await CustomerMeasurementName.findByPk(measNameId);
    if (!existingProfile || String(existingProfile.user_id) !== String(effectiveUserId)) {
      return {
        statusCode: 403,
        body: {
          status: false,
          message: "Unauthorized: This measurement profile does not belong to you.",
        },
      };
    }
  }

  // 4. Transactional execution
  const t = await sequelize.transaction();
  try {
    let measNameRecord = null;

    if (measNameId) {
      measNameRecord = await CustomerMeasurementName.findByPk(measNameId, { transaction: t });
      if (measNameRecord) {
        const updates = {};
        if (measNameInput) updates.name = measNameInput;
        if (gender) updates.gender = gender;
        if (Object.keys(updates).length > 0) {
          await measNameRecord.update(updates, { transaction: t });
        }
      }
    } else if (measNameInput || gender) {
      measNameRecord = await CustomerMeasurementName.create(
        {
          user_id: effectiveUserId,
          name: measNameInput || "Default Measurement",
          gender: gender || null,
        },
        { transaction: t }
      );
      measNameId = measNameRecord.id;
    }

    const createdMeasurements = [];
    for (const m of measurementsList) {
      const val = Array.isArray(m.value) ? parseInt(m.value[0], 10) : parseInt(m.value, 10);
      const measurementId = Number(m.measurement_id);

      const matchCriteria = {
        cust_id: effectiveUserId,
        measurement_id: measurementId,
      };

      if (measNameId) {
        matchCriteria.customer_measurement_name_id = measNameId;
      }

      let measurement = await CustomerMeasurement.findOne({
        where: matchCriteria,
        transaction: t,
      });

      if (measurement) {
        measurement.value = String(val);
        if (measNameId) {
          measurement.customer_measurement_name_id = measNameId;
        }
        await measurement.save({ transaction: t });
      } else {
        measurement = await CustomerMeasurement.create(
          {
            cust_id: effectiveUserId,
            measurement_id: measurementId,
            value: String(val),
            customer_measurement_name_id: measNameId || null,
          },
          { transaction: t }
        );
      }

      createdMeasurements.push({
        cust_measurement_id: Number(measurement.id),
        customer_measurement_name_id: measurement.customer_measurement_name_id
          ? Number(measurement.customer_measurement_name_id)
          : null,
        cust_id: Number(measurement.cust_id),
        measurement_id: Number(measurement.measurement_id),
        value: parseInt(measurement.value, 10),
        profile_name: measNameRecord ? measNameRecord.name : (measNameInput ?? null),
        gender: measNameRecord ? measNameRecord.gender : (gender ?? null),
      });
    }

    await t.commit();

    return {
      statusCode: 201,
      body: {
        status: true,
        message: "Customer measurements created successfully.",
        data: {
          user_id: Number(effectiveUserId),
          cust_id: Number(effectiveUserId),
          customer_measurement_name_id: measNameId ? Number(measNameId) : null,
          name: measNameRecord ? measNameRecord.name : measNameInput,
          gender: measNameRecord ? measNameRecord.gender : gender,
          measurements: createdMeasurements,
        },
      },
    };
  } catch (err) {
    await t.rollback();
    throw err;
  }
}

/**
 * API 4: Edit/Update Single or Multiple Measurements
 * Method: CustomerMeasurementController::update()
 * POST /api/customer-measurement/update/{cust_measurement_id?}
 */
export async function updateCustomerMeasurements({
  targetId,
  data = {},
  authenticatedUserId,
}) {
  const measurementsList = data.measurement || data.measurements;
  const userId = data.user_id || data.cust_id || null;
  const measNameInput = data.name || data.profile_name || null;
  const gender = data.gender || null;
  let measNameId = data.customer_measurement_name_id || data.name_id || null;

  // Security check: Must match authenticated identity
  if (authenticatedUserId && userId && String(authenticatedUserId) !== String(userId)) {
    return {
      statusCode: 403,
      body: {
        status: false,
        message: "Unauthorized: You can only update your own measurements.",
      },
    };
  }

  // =========================================================================
  // Case 1: Multiple / Bulk Measurements Update
  // =========================================================================
  if (Array.isArray(measurementsList) && measurementsList.length > 0) {
    const errors = {};
    for (let i = 0; i < measurementsList.length; i++) {
      const m = measurementsList[i];
      if (!m || m.value === undefined || m.value === null || m.value === "") {
        errors[`measurements.${i}.value`] = ["The value field is required."];
      }
    }

    if (Object.keys(errors).length > 0) {
      return {
        statusCode: 422,
        body: {
          status: false,
          message: "Validation error",
          errors,
        },
      };
    }

    const t = await sequelize.transaction();
    try {
      let profile = null;

      if (measNameId) {
        profile = await CustomerMeasurementName.findByPk(measNameId, { transaction: t });
        if (profile) {
          // Security check: profile must belong to user
          if (userId && String(profile.user_id) !== String(userId)) {
            await t.rollback();
            return {
              statusCode: 403,
              body: {
                status: false,
                message: "Unauthorized: This profile does not belong to you.",
              },
            };
          }
          const updates = {};
          if (measNameInput !== null && measNameInput !== undefined && measNameInput !== "") {
            updates.name = measNameInput;
          }
          if (gender !== null && gender !== undefined && gender !== "") {
            updates.gender = gender;
          }
          if (userId) {
            updates.user_id = userId;
          }
          if (Object.keys(updates).length > 0) {
            await profile.update(updates, { transaction: t });
          }
        }
      } else if (userId && (measNameInput || gender)) {
        profile = await CustomerMeasurementName.create(
          {
            user_id: userId,
            name: measNameInput || "Default Measurement",
            gender: gender || null,
          },
          { transaction: t }
        );
        measNameId = profile.id;
      }

      // Fallback: If measNameId is still empty, look it up from the first measurement being updated
      if (!measNameId && measurementsList.length > 0) {
        const firstCustMeasId = measurementsList[0].cust_measurement_id || measurementsList[0].id || null;
        if (firstCustMeasId) {
          const firstMeas = await CustomerMeasurement.findByPk(firstCustMeasId, { transaction: t });
          if (firstMeas && firstMeas.customer_measurement_name_id) {
            measNameId = firstMeas.customer_measurement_name_id;
            profile = await CustomerMeasurementName.findByPk(measNameId, { transaction: t });
            if (profile) {
              const updates = {};
              if (measNameInput !== null && measNameInput !== undefined && measNameInput !== "") {
                updates.name = measNameInput;
              }
              if (gender !== null && gender !== undefined && gender !== "") {
                updates.gender = gender;
              }
              if (userId) {
                updates.user_id = userId;
              }
              if (Object.keys(updates).length > 0) {
                await profile.update(updates, { transaction: t });
              }
            }
          }
        }
      }

      const updatedList = [];
      for (const m of measurementsList) {
        const val = Array.isArray(m.value) ? parseInt(m.value[0], 10) : parseInt(m.value, 10);
        const custMeasurementId = m.cust_measurement_id || m.id || null;

        if (custMeasurementId) {
          const measurement = await CustomerMeasurement.findByPk(custMeasurementId, { transaction: t });
          if (measurement) {
            // Security check: Customer can only modify their own measurement
            if (userId && String(measurement.cust_id) !== String(userId)) {
              await t.rollback();
              return {
                statusCode: 403,
                body: {
                  status: false,
                  message: "Unauthorized: You cannot modify another user's measurement row.",
                },
              };
            }

            const updateData = { value: String(val) };
            if (measNameId) {
              updateData.customer_measurement_name_id = measNameId;
            }
            if (userId) {
              updateData.cust_id = userId;
            }
            await measurement.update(updateData, { transaction: t });

            updatedList.push({
              cust_measurement_id: Number(measurement.id),
              customer_measurement_name_id: measurement.customer_measurement_name_id
                ? Number(measurement.customer_measurement_name_id)
                : null,
              cust_id: Number(measurement.cust_id),
              measurement_id: Number(measurement.measurement_id),
              value: parseInt(measurement.value, 10),
              profile_name: profile ? profile.name : (measNameInput ?? null),
              gender: profile ? profile.gender : (gender ?? null),
            });
          }
        } else if (userId && m.measurement_id) {
          const matchCriteria = {
            cust_id: userId,
            measurement_id: Number(m.measurement_id),
          };
          if (measNameId) {
            matchCriteria.customer_measurement_name_id = measNameId;
          }

          let measurement = await CustomerMeasurement.findOne({
            where: matchCriteria,
            transaction: t,
          });

          if (measurement) {
            measurement.value = String(val);
            if (measNameId) measurement.customer_measurement_name_id = measNameId;
            await measurement.save({ transaction: t });
          } else {
            measurement = await CustomerMeasurement.create(
              {
                cust_id: userId,
                measurement_id: Number(m.measurement_id),
                value: String(val),
                customer_measurement_name_id: measNameId || null,
              },
              { transaction: t }
            );
          }

          updatedList.push({
            cust_measurement_id: Number(measurement.id),
            customer_measurement_name_id: measurement.customer_measurement_name_id
              ? Number(measurement.customer_measurement_name_id)
              : null,
            cust_id: Number(measurement.cust_id),
            measurement_id: Number(measurement.measurement_id),
            value: parseInt(measurement.value, 10),
            profile_name: profile ? profile.name : (measNameInput ?? null),
            gender: profile ? profile.gender : (gender ?? null),
          });
        }
      }

      await t.commit();

      return {
        statusCode: 200,
        body: {
          status: true,
          message: "Customer measurements updated successfully.",
          data: {
            user_id: userId ? Number(userId) : null,
            cust_id: userId ? Number(userId) : null,
            customer_measurement_name_id: measNameId ? Number(measNameId) : null,
            name: profile ? profile.name : (measNameInput ?? null),
            gender: profile ? profile.gender : (gender ?? null),
            measurements: updatedList,
          },
        },
      };
    } catch (err) {
      await t.rollback();
      throw err;
    }
  }

  // =========================================================================
  // Case 2: Single Measurement Update
  // =========================================================================
  const resolvedTargetId = targetId || data.cust_measurement_id || data.id || null;
  const measurement = resolvedTargetId ? await CustomerMeasurement.findByPk(resolvedTargetId) : null;

  if (!measurement) {
    return {
      statusCode: 404,
      body: {
        status: false,
        message: "Customer measurement not found.",
      },
    };
  }

  // Security check: Must belong to customer
  const effectiveUserId = authenticatedUserId || userId;
  if (effectiveUserId && String(measurement.cust_id) !== String(effectiveUserId)) {
    return {
      statusCode: 403,
      body: {
        status: false,
        message: "Unauthorized: This measurement does not belong to you.",
      },
    };
  }

  if (data.value === undefined || data.value === null || data.value === "") {
    return {
      statusCode: 422,
      body: {
        status: false,
        message: "Validation error",
        errors: { value: ["The value field is required."] },
      },
    };
  }

  const value = Array.isArray(data.value) ? parseInt(data.value[0], 10) : parseInt(data.value, 10);
  const updatePayload = { value: String(value) };

  if (data.customer_measurement_name_id !== undefined) {
    updatePayload.customer_measurement_name_id = data.customer_measurement_name_id;
  }
  if (userId) {
    updatePayload.cust_id = userId;
  }

  await measurement.update(updatePayload);

  const singleMeasNameId = data.customer_measurement_name_id || measurement.customer_measurement_name_id;
  let singleProfile = null;
  if (singleMeasNameId) {
    singleProfile = await CustomerMeasurementName.findByPk(singleMeasNameId);
    if (singleProfile) {
      const updates = {};
      if (data.name) updates.name = data.name;
      if (data.gender) updates.gender = data.gender;
      if (userId) updates.user_id = userId;
      if (Object.keys(updates).length > 0) {
        await singleProfile.update(updates);
      }
    }
  }

  return {
    statusCode: 200,
    body: {
      status: true,
      message: "Customer measurement updated successfully.",
      data: {
        cust_measurement_id: Number(measurement.id),
        customer_measurement_name_id: measurement.customer_measurement_name_id
          ? Number(measurement.customer_measurement_name_id)
          : null,
        cust_id: Number(measurement.cust_id),
        measurement_id: Number(measurement.measurement_id),
        value: parseInt(measurement.value, 10),
        name: singleProfile ? singleProfile.name : (data.name ?? null),
        gender: singleProfile ? singleProfile.gender : (data.gender ?? null),
        profile_name: singleProfile ? singleProfile.name : (data.name ?? null),
      },
    },
  };
}

/**
 * Get all measurement profiles/names for a given user
 * Method: CustomerMeasurementController::getMeasurementNames()
 * GET /api/customer-measurement/names/{user_id}
 */
export async function getMeasurementNames(userId) {
  const profiles = await CustomerMeasurementName.findAll({
    where: { user_id: userId },
    order: [["id", "DESC"]],
  });

  return {
    statusCode: 200,
    body: {
      status: true,
      message: "Customer measurement profiles retrieved successfully.",
      data: profiles,
    },
  };
}
