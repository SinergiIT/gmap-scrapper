import puppeteerExtra from "puppeteer-extra";
import stealthPlugin from "puppeteer-extra-plugin-stealth";

type DistanceResult = {
  distance: string | null;
  duration: string | null;
};

type TravelData = {
  carDistance: DistanceResult;
  motorDistance: DistanceResult;
  coordStart: number[] | null;
  coordFinish: number[] | null;
  nameStart: string | undefined;
  nameFinish: string | undefined;
  start: string;
  finish: string;
};

const editString = async (str: string): Promise<number[] | null> => {
  const atIndex = str.indexOf("@");
  if (atIndex === -1) {
    return null;
  }
  const substring = str.slice(atIndex + 1);
  const parts = substring.split(",");
  const result =
    parts.length >= 2 ? [parseFloat(parts[0]), parseFloat(parts[1])] : null;
  return result;
};

export default async function searchGoogleMaps(
  fromLocation: string,
  toLocation: string
): Promise<TravelData | undefined> {
  let browser;
  try {
    puppeteerExtra.use(stealthPlugin());

    browser = await puppeteerExtra.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const page = await browser.newPage();
    await page.goto("https://www.google.com/maps", {
      waitUntil: "networkidle2",
    });

    // Cari lokasi tujuan
    await page.waitForSelector("input#searchboxinput");
    await page.type("input#searchboxinput", toLocation);
    await page.click("button#searchbox-searchbutton");
    await page.waitForNavigation({ waitUntil: "networkidle2" });
    // Memeriksa apakah tombol 'Rute' ada
    await new Promise((resolve) => setTimeout(resolve, 3000));

    const tombolRute1 = await page.evaluate(() => {
      return !!document.querySelector('button[data-value="Rute"]');
    });
    console.log("tombolRute1 : ", tombolRute1);

    if (!tombolRute1) {
      // Jika tombol 'Rute' tidak ditemukan, cari hasil dari lokasi
      await page.waitForSelector(
        `div[aria-label="Hasil untuk ${toLocation}"] > div > div > a`
      );
      await page.click(
        `div[aria-label="Hasil untuk ${toLocation}"] > div > div > a`
      );
      await page.waitForNavigation({ waitUntil: "networkidle2" });
    }

    const coordFinish = await editString(page.url());
    const nameFinish = await page.evaluate(() => {
      return document.querySelector("h1")?.innerText;
    });

    if (coordFinish) {
      // Bersihkan input dan cari lokasi asal
      await page.waitForSelector("input#searchboxinput");
      await page.evaluate(() => {
        const input = document.querySelector("input#searchboxinput");
        if (input) {
          (input as HTMLInputElement).value = "";
        }
      });

      await page.type("input#searchboxinput", fromLocation);
      await page.keyboard.press("Enter");
      await page.waitForNavigation({ waitUntil: "networkidle2" });

      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Memeriksa apakah tombol 'Rute' ada
      const tombolRute = await page.evaluate(() => {
        return !!document.querySelector('button[data-value="Rute"]');
      });

      console.log("tombolRute : ", tombolRute);
      if (!tombolRute) {
        // Jika tombol 'Rute' tidak ditemukan, cari hasil dari lokasi
        await page.waitForSelector(
          `div[aria-label="Hasil untuk ${fromLocation}"] > div > div > a`
        );
        await page.click(
          `div[aria-label="Hasil untuk ${fromLocation}"] > div > div > a`
        );
        await page.waitForNavigation({ waitUntil: "networkidle2" });
      }
    }

    const coordStart = await editString(page.url());
    const nameStart = await page.evaluate(() => {
      return document.querySelector("h1")?.innerText;
    });

    await new Promise((resolve) => setTimeout(resolve, 3000));
    // Klik tombol Directions (Rute)
    if (coordStart && coordFinish) {
      await page.waitForSelector('button[data-value="Rute"]');
      await page.click('button[data-value="Rute"]');
      await page.waitForSelector("input.tactile-searchbox-input");
      await page.type("input.tactile-searchbox-input", toLocation);
      await page.keyboard.press("Enter");
      await page.waitForNavigation({ waitUntil: "networkidle2" });

      // Ambil jarak untuk kendaraan mobil
      await page.click('div[data-travel_mode="0"] > button');
      await page.waitForSelector('div[data-trip-index="0"]', {
        timeout: 3000,
      });

      const carDistance = await page.evaluate(() => {
        const jarak = document.querySelector(
          'div[data-trip-index="0"] > div > div > div > div:nth-child(2) > div'
        );
        const durasi = document.querySelector(
          'div[data-trip-index="0"] > div > div > div > div:first-child'
        );
        if (jarak && durasi) {
          return {
            distance: (jarak as HTMLElement).innerText || "",
            duration: (durasi as HTMLElement).innerText || "",
          };
        }
        return {
          distance: null,
          duration: null,
        };
      });

      // Ambil jarak untuk kendaraan motor
      await page.click('div[data-travel_mode="9"] > button');
      await page.waitForSelector('div[data-trip-index="0"]', {
        timeout: 3000,
      });

      await new Promise((resolve) => setTimeout(resolve, 3000));

      const motorDistance = await page.evaluate(() => {
        const jarak = document.querySelector(
          'div[data-trip-index="0"] > div > div > div > div:nth-child(2) > div'
        );
        const durasi = document.querySelector(
          'div[data-trip-index="0"] > div > div > div > div:first-child'
        );
        if (jarak && durasi) {
          return {
            distance: (jarak as HTMLElement).innerText || "",
            duration: (durasi as HTMLElement).innerText || "",
          };
        }
        return {
          distance: null,
          duration: null,
        };
      });

      await browser.close();
      return {
        carDistance,
        motorDistance,
        coordStart,
        coordFinish,
        nameStart,
        nameFinish,
        start: fromLocation,
        finish: toLocation,
      };
    }
  } catch (error) {
    console.error("Error during Puppeteer operation:", error);

    if (browser) {
      const page = (await browser.pages())[0];
      await page.screenshot({ path: "error_screenshot.png", fullPage: true });
    }

    throw error;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// export default async function handler(req, res) {
//   if (req.method === "POST") {
//     const { fromLocation, toLocation } = req.body;

//     if (!fromLocation || !toLocation) {
//       return res
//         .status(400)
//         .json({ error: "Both fromLocation and toLocation are required" });
//     }

//     try {
//       const distances = await getDistance(fromLocation, toLocation);
//       res.status(300).json(distances);
//     } catch (error) {
//       console.error("API error:", error);
//       res.status(500).json({ error: "Failed to calculate distance" });
//     }
//   } else {
//     res.status(405).json({ message: "Method not allowed" });
//   }
// }
