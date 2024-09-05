import React, { useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";

interface ExcelData {
  start: string;
  finish: string;
}

type DistanceResult = {
  distance: string | null;
  duration: string | null;
};

interface Place {
  carDistance: DistanceResult;
  motorDistance: DistanceResult;
  coordStart: number[] | null;
  coordFinish: number[] | null;
  nameStart: string | undefined;
  nameFinish: string | undefined;
  start: string;
  finish: string;
}

interface DownloadData {
  Start_Coordinates: string;
  Finish_Coordinates: string;
  Data_Start: string;
  Map_Start: string;
  Data_Finish: string;
  Map_Finish: string;
  Car_Distance: string;
  Car_Duration: string;
  Motor_Distance: string;
  Motor_Duration: string;
}

const Input: React.FC = () => {
  const [data, setData] = useState<ExcelData[]>([]);
  const [newData, setNewData] = useState<Place[]>([]);
  const [dataFail, setDataFail] = useState<ExcelData[]>([]);
  const [countProcess, setCountProcess] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [isAborted, setIsAborted] = useState<boolean>(false);
  const [innerIndex, setInnerIndex] = useState<number>(0);
  const [indexSuccess, setIndexSuccess] = useState<number[]>([]);
  // const [indexFailed, setIndexFailed] = useState<number[]>([]);

  const failedDataChecked = (): ExcelData[] => {
    return data.filter((item) => {
      const isExist = newData.some(
        (value) => value.start === item.start && value.finish === item.finish
      );
      return !isExist;
    });
  };
  // Fungsi delay untuk memberikan jeda
  const delay = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms));

  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    // Initialize a new AbortController
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    localStorage.clear();
    setData([]);
    setNewData([]);
    setDataFail([]);
    setIsLoading(true);
    setCountProcess(0);
    setIsAborted(false);
    setInnerIndex(0);

    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const binaryStr = e.target?.result as string;
        const workbook = XLSX.read(binaryStr, { type: "binary" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData: ExcelData[] = XLSX.utils.sheet_to_json(worksheet);

        setData(jsonData);
        localStorage.setItem("data", JSON.stringify(jsonData));

        console.log("jsonData :", jsonData);
        const inResult: Place[] = [];
        const inFailedResult: ExcelData[] = [];
        const inSuccess: number[] = [];
        const inFailed: number[] = [];
        const batchSize = 10; // Batch size untuk menentukan berapa data yang diproses sekaligus
        let index = 0;

        // Looping untuk memproses data dalam batch
        while (index < jsonData.length) {
          // Ambil batch data sebanyak batchSize
          const batch = jsonData.slice(index, index + batchSize);

          for (const [innerIndex, item] of batch.entries()) {
            try {
              // Check if the operation was aborted
              if (abortController.signal.aborted) {
                console.log("Operation aborted");
                setIsAborted(true);
                return;
              }

              // Await each scraping process with abort signal consideration
              await new Promise<void>((resolve, reject) => {
                setCountProcess((prevCount) => prevCount + 1);
                window.ipcRenderer.once("scraping-done", (event, result) => {
                  console.log(`Item ${index + innerIndex} processed:`, result);
                  console.log("Result newData: ", inResult);
                  inSuccess.push(index + innerIndex);

                  // Ambil elemen terakhir dari inResult
                  const lastItem = inResult[inResult.length - 1];

                  // Cek apakah result berbeda dengan elemen terakhir di inResult
                  const isDifferent =
                    !lastItem ||
                    (lastItem.start !== result.start &&
                      lastItem.finish !== result.finish);

                  const isFound =
                    result.carDistance.distance &&
                    result.carDistance.duration &&
                    result.motorDistance.distance &&
                    result.motorDistance.duration;

                  // Jika berbeda, tambahkan result ke inResult
                  if (isDifferent) {
                    console.log("Memasukkan data baru");
                    setInnerIndex((prevIndex) => prevIndex + 1);
                    console.log("data baru dalam isFound");
                    inResult.push(result);
                    if (isFound) {
                      setIndexSuccess((prevIndex) => [
                        ...prevIndex,
                        inSuccess[inSuccess.length - 1],
                      ]);
                      setNewData((prevData) => [...prevData, result]);
                      const dataLS = JSON.parse(
                        localStorage.getItem("newData") || "[]"
                      );
                      localStorage.setItem(
                        "newData",
                        JSON.stringify([...dataLS, result])
                      );
                    }
                  }

                  console.log(event);
                  resolve();
                });

                window.ipcRenderer.once(
                  "scraping-error",
                  (event, arg, error) => {
                    console.error(
                      `Error processing item ${index + innerIndex}:`,
                      arg,
                      error
                    );
                    console.log(event);
                    inFailed.push(index + innerIndex);

                    const lastItem = inFailedResult[inFailedResult.length - 1];

                    const isDifferent =
                      !lastItem ||
                      (lastItem.start !== arg.start &&
                        lastItem.finish !== arg.finish);

                    if (isDifferent) {
                      inFailedResult.push(arg);
                      setInnerIndex((prevIndex) => prevIndex + 1);
                      // setIndexFailed((prevIndex) => [
                      //   ...prevIndex,
                      //   inFailed[inFailed.length - 1],
                      // ]);
                    }
                    reject(arg);
                  }
                );

                window.ipcRenderer.send("start-scraping", item);

                // Listen to the abort signal
                abortController.signal.addEventListener("abort", () => {
                  reject(new DOMException("AbortError"));
                });
              });

              console.log("newData Loop :", newData);
            } catch (error) {
              console.error(
                `Error processing item ${index + innerIndex}:`,
                error
              );
            }
          }

          // Berikan jeda selama 1 detik setelah setiap batch
          await delay(1000);

          // Update index untuk melanjutkan ke batch berikutnya
          index += batchSize;
        }

        // Reset inResult setelah semua proses selesai
        inResult.length = 0;

        console.log("newData Final:", newData);
        setIsLoading(false);
        failedDataChecked();
      };
      reader.readAsBinaryString(file);
    }
  };

  // Somewhere else in your component
  const handleAbort = () => {
    abortControllerRef.current?.abort(); // Trigger the abort signal
  };

  console.log(countProcess, innerIndex);

  useEffect(() => {
    if (data.length === 0) {
      // Mendapatkan data dari localStorage dan mengatur state dengan setData
      const savedData = JSON.parse(localStorage.getItem("data") || "[]");
      setData(savedData);
    }

    if (dataFail?.length === 0) {
      const savedData = JSON.parse(localStorage.getItem("dataFail;") || "[]");
      setDataFail(savedData);
    }

    if (newData?.length === 0) {
      const savedData = JSON.parse(localStorage.getItem("newData") || "[]");
      setNewData(savedData);
    }

    if (isAborted && countProcess === innerIndex) {
      console.log("SELESAI");
      setIsLoading(false);
      setIsAborted(false);
      const failed: ExcelData[] = failedDataChecked();
      setDataFail(failed);
      localStorage.setItem("dataFail;", JSON.stringify(failed));
    }
    if (!isLoading) {
      const failed: ExcelData[] = failedDataChecked();
      setDataFail(failed);
      localStorage.setItem("dataFail;", JSON.stringify(failed));
    }
  }, [isAborted, countProcess, innerIndex, isLoading]);

  console.log("newData Out:", newData);
  console.log("Aborted Out:", isAborted);

  const handleDownloadResult = (
    event: React.MouseEvent<HTMLButtonElement, MouseEvent>,
    value: string
  ) => {
    console.log(event);
    if (newData.length === 0 && value === "success") {
      alert("No data available to download");
      return;
    } else if (dataFail.length === 0 && value === "fail") {
      alert("No data available to download");
      return;
    }
    let data: DownloadData[] | ExcelData[] = [];
    if (value === "success") {
      // Format data menjadi array of objects
      data = newData.map((item) => ({
        Start_Coordinates: item?.coordStart
          ? `${item.coordStart[0]},${item.coordStart[1]}`
          : "",
        Finish_Coordinates: item?.coordFinish
          ? `${item.coordFinish[0]},${item.coordFinish[1]}`
          : "",
        Data_Start: `${item.start}`,
        Map_Start: `${item.nameStart}`,
        Data_Finish: `${item.finish}`,
        Map_Finish: `${item.nameFinish}`,
        Car_Distance: `${item.carDistance.distance}`,
        Car_Duration: `${item.carDistance.duration}`,
        Motor_Distance: `${item.motorDistance.distance}`,
        Motor_Duration: `${item.motorDistance.duration}`,
      }));
    } else if (value === "fail") {
      data = dataFail.map((item) => ({
        start: item.start,
        finish: item.finish,
      }));
    }

    // Buat worksheet
    const worksheet = XLSX.utils.json_to_sheet(data);

    // Buat workbook dan tambahkan worksheet
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Routes");

    // Konversi workbook menjadi file Excel
    const excelBuffer = XLSX.write(workbook, {
      bookType: "xlsx",
      type: "array",
    });

    // Simpan file dengan nama
    const blob = new Blob([excelBuffer], { type: "application/octet-stream" });
    if (value === "success") {
      saveAs(blob, "scrapped_data.xlsx");
    } else if (value === "fail") {
      saveAs(blob, "failed_data.xlsx");
    }
  };

  const handleReload = () => {
    window.location.reload();
    localStorage.clear();
  };

  return (
    <div
      className={`min-h-screen flex flex-col items-center ${
        data.length > 0 ? "justify-start" : "justify-center"
      } p-6 px-10 xl:px-20`}
    >
      <div
        className={`text-3xl xl:text-6xl font-bold mb-4 ${
          data.length > 0 ? "xl:my-5" : "xl:mb-10"
        }`}
      >
        Google Map Data Scrapper
      </div>
      <div className="flex gap-4">
        {(isLoading || newData.length === 0) && (
          <label
            className={`flex items-center gap-2 text-white ${
              isLoading
                ? "font-normal bg-slate-600"
                : "font-semibold cursor-pointer bg-blue-700 hover:bg-blue-900"
            } py-2 px-4 rounded`}
            htmlFor="addData"
          >
            {isLoading ? (
              <>
                <div className="animate-spin rounded-full h-6 w-6 border-4 border-y-yellow-500 border-l-yellow-500 border-r-yellow-200"></div>
                Processing data [{countProcess}/{data.length}]
              </>
            ) : (
              <>
                <i className="fa-solid fa-upload mr-2"></i>
                Add Data
              </>
            )}
          </label>
        )}

        {data.length > 0 && !isLoading && (
          <button
            onClick={handleReload}
            className="flex items-center justify-center gap-2 bg-yellow-600 hover:bg-yellow-700 text-white text-xl py-1 px-3 rounded"
          >
            <i className="fa-solid fa-rotate-right"></i>
            <div className="text-base font-semibold">reload</div>
          </button>
        )}

        {isLoading && (
          <button
            disabled={isAborted}
            onClick={handleAbort}
            className={`${
              isAborted
                ? "font-normal bg-red-950"
                : "font-bold bg-red-700 hover:bg-red-900 cursor-pointer"
            } text-white py-2 px-4 rounded`}
          >
            {isAborted ? (
              "waiting..."
            ) : (
              <>
                <i className="fa-solid fa-xmark mr-2"></i>
                cancel
              </>
            )}
          </button>
        )}
      </div>
      <input
        id="addData"
        className="hidden"
        type="file"
        onChange={handleFileUpload}
        accept=".xlsx, .xls"
        disabled={isLoading}
      />

      {/* RAW DATA */}
      {data.length > 0 && (
        <div className="block md:hidden xl:w-[48%] text-xs mt-4">
          {data.map((row, index) => (
            <div key={index} className="grid grid-cols-12">
              <div
                className={`col-span-5 text-start ${
                  index % 2 !== 0 ? "bg-slate-50" : "bg-slate-100"
                } px-3 py-1 ${
                  countProcess - 1 == index && isLoading && "raw-loading"
                } ${indexSuccess.includes(index) && "raw-success"} ${
                  !indexSuccess.includes(index) &&
                  index < (isLoading ? countProcess - 1 : countProcess) &&
                  "raw-failed"
                } ${countProcess - 1 < index && "raw-waiting"}`}
              >
                {row.start}
              </div>
              <div
                className={`col-span-2 text-center px-3 py-1 ${
                  index % 2 !== 0 ? "bg-slate-50" : "bg-slate-100"
                } ${countProcess - 1 == index && isLoading && "raw-loading"} ${
                  indexSuccess.includes(index) && "raw-success"
                } ${
                  !indexSuccess.includes(index) &&
                  index < (isLoading ? countProcess - 1 : countProcess) &&
                  "raw-failed"
                } ${countProcess - 1 < index && "raw-waiting"}`}
              >
                <i className="fa-solid fa-arrow-right-long" />
              </div>
              <div
                className={`col-span-5 text-right ${
                  index % 2 !== 0 ? "bg-slate-50" : "bg-slate-100"
                } px-3 py-1 ${
                  countProcess - 1 == index && isLoading && "raw-loading"
                } ${indexSuccess.includes(index) && "raw-success"} ${
                  !indexSuccess.includes(index) &&
                  index < (isLoading ? countProcess - 1 : countProcess) &&
                  "raw-failed"
                } ${countProcess - 1 < index && "raw-waiting"}`}
              >
                {row.finish}
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="hidden w-screen md:flex flex-wrap text-xs xl:text-sm px-10 xl:px-20 mt-10">
        {data.length > 0 &&
          data.map((row, index) => (
            <div key={index} className="w-[48%] flex justify-between mx-[1%]">
              <div
                className={`w-[45%] px-2 py-1 text-left ${
                  index % 4 === 2 || index % 4 === 3
                    ? "bg-slate-50"
                    : "bg-slate-100"
                } ${countProcess - 1 == index && isLoading && "raw-loading"} ${
                  indexSuccess.includes(index) && "raw-success"
                } ${
                  !indexSuccess.includes(index) &&
                  index < (isLoading ? countProcess - 1 : countProcess) &&
                  "raw-failed"
                } ${countProcess - 1 < index && "raw-waiting"}`}
              >
                {row.start}
              </div>
              <div
                className={`w-[10%] px-2 py-1 text-center ${
                  index % 4 === 2 || index % 4 === 3
                    ? "bg-slate-50"
                    : "bg-slate-100"
                } ${countProcess - 1 == index && isLoading && "raw-loading"} ${
                  indexSuccess.includes(index) && "raw-success"
                } ${
                  !indexSuccess.includes(index) &&
                  index < (isLoading ? countProcess - 1 : countProcess) &&
                  "raw-failed"
                } ${countProcess - 1 < index && "raw-waiting"}`}
              >
                <i className="fa-solid fa-arrow-right-long" />
              </div>
              <div
                className={`w-[45%] px-2 py-1 text-right ${
                  index % 4 === 2 || index % 4 === 3
                    ? "bg-slate-50"
                    : "bg-slate-100"
                } ${countProcess - 1 == index && isLoading && "raw-loading"} ${
                  indexSuccess.includes(index) && "raw-success"
                } ${
                  !indexSuccess.includes(index) &&
                  index < (isLoading ? countProcess - 1 : countProcess) &&
                  "raw-failed"
                } ${countProcess - 1 < index && "raw-waiting"}`}
              >
                {row.finish}
              </div>
            </div>
          ))}
      </div>

      {/* RESULT */}
      {newData.length > 0 && (
        <>
          <div className="w-full flex justify-between items-center mt-10 mb-2">
            <h1 className="text-2xl font-bold">&raquo; Result</h1>
            <button
              onClick={(event) => handleDownloadResult(event, "success")}
              className="bg-emerald-700 hover:bg-emerald-900 text-white py-2 px-4 rounded"
            >
              <i className="fa-solid fa-download mr-2" /> Download Result
            </button>
          </div>
          <div className="w-full grid grid-cols-12 bg-slate-900 text-white text-center font-semibold px-2">
            <div className="col-span-1 py-2">No.</div>
            <div className="col-span-4 py-2">Start</div>
            <div className="col-span-4 py-2">Finish</div>
            <div className="col-span-3 py-2">
              <div className="grid grid-cols-2">
                <div className="col-span-1">Car</div>
                <div className="col-span-1">Motorcycle</div>
              </div>
            </div>
          </div>
          {newData.map((item, index) => (
            <div
              key={index}
              className={`${
                index % 2 !== 0 ? "bg-slate-200" : "bg-slate-50"
              } w-full grid grid-cols-12 text-center text-xs md:text-sm xl:text-base px-2`}
            >
              <div className={`col-span-1 px-2 py-[2px] md:py-1`}>
                {index + 1}
              </div>
              <div className={`col-span-4 px-2 py-[2px] md:py-1`}>
                {item.start}{" "}
                {item.nameStart &&
                  item.nameStart !== "Hasil" &&
                  `(${item.nameStart})`}{" "}
                <br />[{item.coordStart?.join(", ")}]
              </div>
              <div className={`col-span-4 px-2 py-[2px] md:py-1`}>
                {item.finish}{" "}
                {item.nameFinish &&
                  item.nameFinish !== "Hasil" &&
                  `(${item.nameFinish})`}{" "}
                <br />[{item.coordFinish?.join(", ")}]
              </div>
              <div className={`col-span-3`}>
                <div className="grid grid-cols-2">
                  <div className={`col-span-1 px-2 py-[2px] md:py-1`}>
                    {item.carDistance.distance} ({item.carDistance.duration})
                  </div>
                  <div className={`col-span-1 px-2 py-[2px] md:py-1`}>
                    {item.motorDistance.distance} ({item.motorDistance.duration}
                    )
                  </div>
                </div>
              </div>
            </div>
          ))}
        </>
      )}

      {/* FAILED */}
      {dataFail.length > 0 && (
        <>
          <div className="w-full flex justify-between items-center mt-10 mb-2">
            <h1 className="text-2xl font-bold">&raquo; Failed</h1>

            <button
              onClick={(event) => handleDownloadResult(event, "fail")}
              className="bg-red-700 hover:bg-red-900 text-white py-2 px-4 rounded"
            >
              <i className="fa-solid fa-download mr-2" /> Download Data Failed
            </button>
          </div>
          <div className="w-full grid grid-cols-11 bg-red-900 text-white text-center font-semibold px-2">
            <div className="col-span-1 py-2">No.</div>
            <div className="col-span-5 py-2">Start</div>
            <div className="col-span-5 py-2">Finish</div>
          </div>
          {dataFail.map((item, index) => (
            <div
              key={index}
              className={`${
                index % 2 !== 0 ? "bg-red-100" : "bg-red-50"
              } w-full grid grid-cols-11 text-center text-xs md:text-sm xl:text-base px-2`}
            >
              <div className={`col-span-1 px-2 py-[2px] md:py-1`}>
                {index + 1}
              </div>
              <div className={`col-span-5 px-2 py-[2px] md:py-1`}>
                {item.start}
              </div>
              <div className={`col-span-5 px-2 py-[2px] md:py-1`}>
                {item.finish}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
};

export default Input;
