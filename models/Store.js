const mongoose = require("mongoose");
mongoose.Promise = global.Promise; // Set Promise property to use ES6 Promises

const slug = require("slugs");

const storeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      trim: true,
      required: "Please enter a store name!",
    },
    slug: String,
    description: {
      type: String,
      trim: true,
    },
    tags: [String],
    created: {
      type: Date,
      default: Date.now,
    },
    location: {
      type: {
        type: String,
        default: "Point",
      },
      coordinates: [
        {
          type: Number,
          required: "You must supply coordinates!",
        },
      ],
      address: {
        type: String,
        required: "You must supply an address!",
      },
    },
    photo: String,
    author: {
      type: mongoose.Schema.ObjectId,
      ref: "User",
      required: "You must supply an author.",
    },
  },
  {
    toJSON: { virtuals: true }, // Include virtuals in JSON
    toObject: { virtuals: true }, // include virtuals in object
  }
);

// Define indexes
storeSchema.index({
  name: "text",
  description: "text",
});

storeSchema.index({
  location: "2dsphere",
});

storeSchema.pre("save", async function (next) {
  if (!this.isModified("name")) {
    return next();
  }

  this.slug = slug(this.name);

  // find other stores who has slug of wes, wes-1, wes-2 etc
  const slugRegEx = new RegExp(`^(${this.slug})((-[0-9]*$)?)$`, "i");

  const storesWithSlug = await this.constructor.find({ slug: slugRegEx });

  if (storesWithSlug.length) {
    this.slug = `${this.slug}-${storesWithSlug.length + 1}`;
  }

  next();
});

// Custom functions sit on statics
storeSchema.statics.getTagsList = function () {
  // this bound to model hence no arrow function
  return this.aggregate([
    { $unwind: "$tags" }, // splits up data so each tag gets its won store
    { $group: { _id: "$tags", count: { $sum: 1 } } }, // group by tag and add new value count and increase with 1 for each
    { $sort: { count: -1, _id: 1 } }, // sort list based on count and alphabetical
  ]);
};

storeSchema.statics.getTopStores = function () {
  // Does not have access to the virtual fields from below since that is mongoose
  // and this is lower level mongodb
  return this.aggregate([
    // Lookup stores and populate reviews
    {
      $lookup: {
        from: "reviews",
        localField: "_id",
        foreignField: "store",
        as: "reviews",
      },
    },
    // filter for only items that have 2 or more reviews
    {
      $match: {
        "reviews.1": { $exists: true }, // where second item reviews[1] exists so more than 1
      },
    },
    // add average reviews field
    // $project can be replace with $addField in newer versions of mongodb
    // {
    //   $addField: {
    //     averageRating: { $avg: "$reviews.rating" }
    //   }
    // }
    // workaround for older versions
    {
      $project: {
        photo: "$$ROOT.photo",
        name: "$$ROOT.name",
        reviews: "$$ROOT.reviews",
        slug: "$$ROOT.slug",
        averageRating: { $avg: "$reviews.rating" }
      }
    },
    // sort it by new field, highest first
    {
      $sort: {
        averageRating: -1
      }
    },
    // limit ot at most 10
    {
      $limit: 10
    }
  ]);
};

// find reviews where stores _id property === reviews store property
storeSchema.virtual("reviews", {
  ref: "Review", // what model to link with
  localField: "_id", // what field on store
  foreignField: "store", // what field on review
});

function autopopulate(next) {
  this.populate("reviews");
  next();
}

storeSchema.pre("find", autopopulate);
storeSchema.pre("findOne", autopopulate);

module.exports = mongoose.model("Store", storeSchema);
